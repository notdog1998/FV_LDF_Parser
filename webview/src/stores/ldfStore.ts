/**
 * Pinia store — 整个 WebView 的状态中枢(对应 PRD §9.3)
 *
 * 总体设计:
 * - 与后端「Strategy C」内存缓存对齐: signals/frames 数组反映当前视图状态(包含尚未保存的修改),
 *   pendingSignalChanges / pendingFrameChanges 仅作为「保存时要发给后端的变更清单」存在。
 * - 删除 = 数组里**保留**原对象 + pending 里追加 _action='delete',视图据 row state 染灰。
 *   这与后端 SignalService.delete 把对象从 cache 移除不同 — 因为前端要支持「保存前撤销」。
 * - 创建项的 pending 永远是 _action='create',即使后续多次 updateSignal 也只更新 data,不变成 update。
 *   这与后端 applyChanges 的 create→update 升级是镜像的: 后端在 applyChanges 阶段才看
 *   originalCache,前端在产生 pending 阶段就锁定 action。
 *
 * 注释规范: webview/v1 教学例外(PRD §10),defineStore / ref / computed 等关键 API 首次出现处带 WHY。
 */

// defineStore 是 Pinia 的核心 API,把状态/actions/getters 收敛在一个工厂函数里,
// 比 Vuex 模块化更轻;'composition setup' 写法让我们直接用 ref/computed,跟 SFC 写法保持一致。
import { defineStore } from 'pinia';
// ref 创建响应式基础类型,computed 创建只读派生值,reactive 处理对象。
// 在 store 中我们倾向用 ref + computed,显式声明依赖关系,便于阅读。
import { computed, ref } from 'vue';

import { onMessage, postMessage } from '@/api/vscode';
import type {
  InboundMessage,
  LdfChange,
  LdfFrame,
  LdfNodes,
  LdfOverview,
  LdfPayload,
  LdfSignal,
} from '@/types/ldf';
import {
  validateFrame,
  validateMapping,
  validateSignal,
} from '@/utils/validators';

export type RowState = 'unchanged' | 'created' | 'updated' | 'deleted';

export const useLdfStore = defineStore('ldf', () => {
  /* ---------- 后端最近一次 ok payload 的镜像 ---------- */
  const overview = ref<LdfOverview | null>(null);
  const nodes = ref<LdfNodes | null>(null);
  const signals = ref<LdfSignal[]>([]);
  const frames = ref<LdfFrame[]>([]);

  /* ---------- 用户暂存变更 ---------- */
  const pendingSignalChanges = ref<LdfChange<LdfSignal>[]>([]);
  const pendingFrameChanges = ref<LdfChange<LdfFrame>[]>([]);

  /* ---------- 顶层 UI 状态 ---------- */
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const errorMessage = ref<string | null>(null);
  const saveErrorMessage = ref<string | null>(null);

  /* ---------- 监听器引用,bootstrap 时注册 ---------- */
  let unsubscribe: (() => void) | null = null;

  /* ============================================================
   * 内部辅助函数 — 定位/合并 pending changes
   * ============================================================ */

  function findSignalChangeIndex(name: string): number {
    return pendingSignalChanges.value.findIndex((c) => c.data.name === name);
  }
  function findFrameChangeIndex(name: string): number {
    return pendingFrameChanges.value.findIndex((c) => c.data.name === name);
  }

  function isOriginalSignal(name: string): boolean {
    // 「原始」= 来自最近一次后端 payload 的信号集合,需要排除前端新建项
    const change = pendingSignalChanges.value.find(
      (c) => c.data.name === name && c._action === 'create'
    );
    return signals.value.some((s) => s.name === name) && !change;
  }
  function isOriginalFrame(name: string): boolean {
    const change = pendingFrameChanges.value.find(
      (c) => c.data.name === name && c._action === 'create'
    );
    return frames.value.some((f) => f.name === name) && !change;
  }

  /* ============================================================
   * 消息处理 — Extension Host → WebView
   * ============================================================ */

  function handleInbound(msg: InboundMessage): void {
    switch (msg.type) {
      case 'loading':
        status.value = 'loading';
        errorMessage.value = null;
        break;
      case 'ok':
        absorbPayload(msg.payload);
        break;
      case 'error':
        status.value = 'error';
        errorMessage.value = msg.payload;
        break;
      case 'saveError':
        saveErrorMessage.value = msg.payload;
        break;
    }
  }

  /** 把后端 payload 写进 store,并清空所有 pending 变更与错误。 */
  function absorbPayload(payload: LdfPayload): void {
    overview.value = payload.overview;
    nodes.value = payload.nodes;
    // 深拷贝避免后端响应被组件层意外修改后污染 store(Vue ref 会代理,但内部数组成员仍是同一引用)
    signals.value = payload.signals.map((s) => ({ ...s }));
    frames.value = payload.frames.map((f) => ({
      ...f,
      signals: f.signals.map((m) => ({ ...m })),
    }));
    pendingSignalChanges.value = [];
    pendingFrameChanges.value = [];
    errorMessage.value = null;
    saveErrorMessage.value = null;
    status.value = 'ready';
  }

  /* ============================================================
   * 全局动作
   * ============================================================ */

  /** 注册消息监听并向 Extension 发送 ready,App.vue onMounted 调用一次。 */
  function bootstrap(): void {
    if (unsubscribe) {
      return; // 防止 HMR 重复注册导致内存泄漏
    }
    unsubscribe = onMessage(handleInbound);
    postMessage({ type: 'ready' });
  }

  /** 二次确认刷新 — 调用方负责弹窗,store 只清 pending + 发消息。 */
  function requestRefresh(): void {
    pendingSignalChanges.value = [];
    pendingFrameChanges.value = [];
    saveErrorMessage.value = null;
    postMessage({ type: 'requestRefresh' });
  }

  /** 把 pending 列表打包发给 Extension;ok 回执到达后由 absorbPayload 重置。 */
  function saveChanges(): void {
    saveErrorMessage.value = null;
    postMessage({
      type: 'saveChanges',
      payload: {
        signals: pendingSignalChanges.value.map(stripUiFlags),
        frames: pendingFrameChanges.value.map(stripUiFlags),
      },
    });
  }

  /** 去掉只在前端有意义的字段(_id/_editing),保留 _action+data 给后端。 */
  function stripUiFlags<T>(change: LdfChange<T>): LdfChange<T> {
    return { _action: change._action, data: change.data };
  }

  /* ============================================================
   * 信号 CRUD
   * ============================================================ */

  /** 新建信号 — 校验通过后追加 _action='create',signals 数组同步更新。 */
  function createSignal(data: LdfSignal): void {
    if (signals.value.some((s) => s.name === data.name)) {
      throw new Error(`Signal already exists: ${data.name}`);
    }
    const error = validateSignal(data);
    if (error) {
      throw new Error(error);
    }
    signals.value.push({ ...data });
    pendingSignalChanges.value.push({ _action: 'create', data: { ...data } });
  }

  /** 更新信号 — 合并 pending change(create 保持 create,delete 不允许更新)。 */
  function updateSignal(name: string, patch: Partial<LdfSignal>): void {
    const idx = signals.value.findIndex((s) => s.name === name);
    if (idx === -1) {
      throw new Error(`Signal not found: ${name}`);
    }
    const merged: LdfSignal = { ...signals.value[idx], ...patch };
    const error = validateSignal(merged);
    if (error) {
      throw new Error(error);
    }
    signals.value[idx] = merged;

    const existingIdx = findSignalChangeIndex(name);
    if (existingIdx >= 0) {
      const existing = pendingSignalChanges.value[existingIdx];
      // create / delete 已经定型了;update 只覆写 data
      pendingSignalChanges.value[existingIdx] = {
        ...existing,
        data: { ...merged },
      };
    } else {
      pendingSignalChanges.value.push({ _action: 'update', data: { ...merged } });
    }
  }

  /** 标记删除 — 对原始信号叠加 _action='delete';对未保存的新建信号直接撤销 pending。 */
  function markSignalDeleted(name: string): void {
    const target = signals.value.find((s) => s.name === name);
    if (!target) {
      throw new Error(`Signal not found: ${name}`);
    }
    const existingIdx = findSignalChangeIndex(name);
    if (existingIdx >= 0 && pendingSignalChanges.value[existingIdx]._action === 'create') {
      pendingSignalChanges.value.splice(existingIdx, 1);
      signals.value = signals.value.filter((s) => s.name !== name);
      return;
    }
    if (existingIdx >= 0) {
      pendingSignalChanges.value.splice(existingIdx, 1);
    }
    pendingSignalChanges.value.push({ _action: 'delete', data: { ...target } });
  }

  /** 撤销已标记的删除。 */
  function cancelSignalDelete(name: string): void {
    const idx = findSignalChangeIndex(name);
    if (idx === -1 || pendingSignalChanges.value[idx]._action !== 'delete') {
      return;
    }
    pendingSignalChanges.value.splice(idx, 1);
  }

  /* ============================================================
   * 帧 CRUD + 信号映射
   * ============================================================ */

  function createFrame(data: LdfFrame): void {
    if (frames.value.some((f) => f.name === data.name)) {
      throw new Error(`Frame already exists: ${data.name}`);
    }
    const error = validateFrame(data);
    if (error) {
      throw new Error(error);
    }
    const cloned: LdfFrame = {
      ...data,
      signals: data.signals.map((m) => ({ ...m })),
    };
    frames.value.push(cloned);
    pendingFrameChanges.value.push({
      _action: 'create',
      data: { ...cloned, signals: cloned.signals.map((m) => ({ ...m })) },
    });
  }

  function updateFrame(name: string, patch: Partial<LdfFrame>): void {
    const idx = frames.value.findIndex((f) => f.name === name);
    if (idx === -1) {
      throw new Error(`Frame not found: ${name}`);
    }
    const current = frames.value[idx];
    const merged: LdfFrame = {
      ...current,
      ...patch,
      signals: patch.signals
        ? patch.signals.map((m) => ({ ...m }))
        : current.signals.map((m) => ({ ...m })),
    };
    const error = validateFrame(merged);
    if (error) {
      throw new Error(error);
    }
    frames.value[idx] = merged;

    const existingIdx = findFrameChangeIndex(name);
    if (existingIdx >= 0) {
      const existing = pendingFrameChanges.value[existingIdx];
      pendingFrameChanges.value[existingIdx] = {
        ...existing,
        data: { ...merged, signals: merged.signals.map((m) => ({ ...m })) },
      };
    } else {
      pendingFrameChanges.value.push({
        _action: 'update',
        data: { ...merged, signals: merged.signals.map((m) => ({ ...m })) },
      });
    }
  }

  function markFrameDeleted(name: string): void {
    const target = frames.value.find((f) => f.name === name);
    if (!target) {
      throw new Error(`Frame not found: ${name}`);
    }
    const existingIdx = findFrameChangeIndex(name);
    if (existingIdx >= 0 && pendingFrameChanges.value[existingIdx]._action === 'create') {
      pendingFrameChanges.value.splice(existingIdx, 1);
      frames.value = frames.value.filter((f) => f.name !== name);
      return;
    }
    if (existingIdx >= 0) {
      pendingFrameChanges.value.splice(existingIdx, 1);
    }
    pendingFrameChanges.value.push({
      _action: 'delete',
      data: { ...target, signals: target.signals.map((m) => ({ ...m })) },
    });
  }

  function cancelFrameDelete(name: string): void {
    const idx = findFrameChangeIndex(name);
    if (idx === -1 || pendingFrameChanges.value[idx]._action !== 'delete') {
      return;
    }
    pendingFrameChanges.value.splice(idx, 1);
  }

  /** 在帧内追加信号映射,自动校验越界,产生 update pending。 */
  function addSignalMapping(
    frameName: string,
    signalName: string,
    offset: number
  ): void {
    const frame = frames.value.find((f) => f.name === frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }
    const signal = signals.value.find((s) => s.name === signalName);
    if (!signal) {
      throw new Error(`Signal not found: ${signalName}`);
    }
    const error = validateMapping(signal.width, offset, frame.length);
    if (error) {
      throw new Error(error);
    }
    const updated: LdfFrame = {
      ...frame,
      signals: [...frame.signals, { signal: signalName, offset }],
    };
    applyFrameUpdate(frameName, updated);
  }

  function removeSignalMapping(frameName: string, signalName: string): void {
    const frame = frames.value.find((f) => f.name === frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }
    const updated: LdfFrame = {
      ...frame,
      signals: frame.signals.filter((m) => m.signal !== signalName),
    };
    applyFrameUpdate(frameName, updated);
  }

  function updateSignalOffset(
    frameName: string,
    signalName: string,
    offset: number
  ): void {
    const frame = frames.value.find((f) => f.name === frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }
    const signal = signals.value.find((s) => s.name === signalName);
    if (!signal) {
      throw new Error(`Signal not found: ${signalName}`);
    }
    const error = validateMapping(signal.width, offset, frame.length);
    if (error) {
      throw new Error(error);
    }
    const updated: LdfFrame = {
      ...frame,
      signals: frame.signals.map((m) =>
        m.signal === signalName ? { signal: signalName, offset } : m
      ),
    };
    applyFrameUpdate(frameName, updated);
  }

  /** 把帧 mutate 后的结果同步进 frames 与 pending,处理 create/update 合并。 */
  function applyFrameUpdate(frameName: string, updated: LdfFrame): void {
    const idx = frames.value.findIndex((f) => f.name === frameName);
    frames.value[idx] = updated;

    const existingIdx = findFrameChangeIndex(frameName);
    if (existingIdx >= 0) {
      const existing = pendingFrameChanges.value[existingIdx];
      pendingFrameChanges.value[existingIdx] = {
        ...existing,
        data: { ...updated, signals: updated.signals.map((m) => ({ ...m })) },
      };
    } else {
      pendingFrameChanges.value.push({
        _action: 'update',
        data: { ...updated, signals: updated.signals.map((m) => ({ ...m })) },
      });
    }
  }

  /* ============================================================
   * Getters
   * ============================================================ */

  // computed 创建只读派生值,依赖任意 ref 变化都会自动重算;模板里直接 store.hasPendingChanges 即可。
  const hasPendingChanges = computed(
    () => pendingSignalChanges.value.length + pendingFrameChanges.value.length > 0
  );

  /** 行状态 — 决定 ChangeBadge 颜色与 row class。 */
  function signalRowState(name: string): RowState {
    const change = pendingSignalChanges.value.find((c) => c.data.name === name);
    if (!change) {
      return 'unchanged';
    }
    return change._action === 'create'
      ? 'created'
      : change._action === 'delete'
        ? 'deleted'
        : 'updated';
  }

  function frameRowState(name: string): RowState {
    const change = pendingFrameChanges.value.find((c) => c.data.name === name);
    if (!change) {
      return 'unchanged';
    }
    return change._action === 'create'
      ? 'created'
      : change._action === 'delete'
        ? 'deleted'
        : 'updated';
  }

  return {
    // state
    overview,
    nodes,
    signals,
    frames,
    pendingSignalChanges,
    pendingFrameChanges,
    status,
    errorMessage,
    saveErrorMessage,
    // global actions
    bootstrap,
    requestRefresh,
    saveChanges,
    // signal CRUD
    createSignal,
    updateSignal,
    markSignalDeleted,
    cancelSignalDelete,
    // frame CRUD + mapping
    createFrame,
    updateFrame,
    markFrameDeleted,
    cancelFrameDelete,
    addSignalMapping,
    removeSignalMapping,
    updateSignalOffset,
    // getters
    hasPendingChanges,
    signalRowState,
    frameRowState,
    // 仅用于内部测试/调试,业务代码不要依赖
    _isOriginalSignal: isOriginalSignal,
    _isOriginalFrame: isOriginalFrame,
  };
});
