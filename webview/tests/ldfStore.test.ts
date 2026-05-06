/**
 * Pinia ldfStore 单元测试 — 对应 PRD §9.3 / §9.7
 *
 * 测试策略:
 * - mock @/api/vscode 的 postMessage / onMessage,验证 store 与 Extension 之间的握手协议
 * - onMessage 用一个手动 trigger 函数模拟 Extension Host 推消息(避免依赖真实 MessageEvent)
 * - 每个 it 之前重新 setActivePinia,保证 store 之间互不污染
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { InboundMessage, OutboundMessage } from '@/types/ldf';

// vi.mock 必须出现在最顶部(hoist),mock 与 import 同一文件路径才能生效
const postMessageMock = vi.fn<(msg: OutboundMessage) => void>();
const triggerInbound: { fn: ((msg: InboundMessage) => void) | null } = { fn: null };

vi.mock('@/api/vscode', () => ({
  postMessage: (msg: OutboundMessage) => postMessageMock(msg),
  onMessage: (handler: (msg: InboundMessage) => void) => {
    triggerInbound.fn = handler;
    return () => {
      triggerInbound.fn = null;
    };
  },
}));

// 必须在 vi.mock 后再 import 被测 store,否则 import 顺序会绕过 mock
import { useLdfStore } from '@/stores/ldfStore';

const samplePayload = {
  overview: {
    protocol_version: '2.2',
    language_version: '2.2',
    baudrate: 19200,
    checksum_model: 'enhanced' as const,
  },
  nodes: {
    master: { name: 'Master', timebase: 5, jitter: 0.1 },
    slaves: [
      { name: 'SlaveA', configured_nad: 0x10 },
    ],
  },
  signals: [
    { name: 'EngineRPM', width: 16, init_value: 0 },
    { name: 'CoolantTemp', width: 8, init_value: 0 },
  ],
  frames: [
    {
      name: 'EngineFrame',
      frame_id: 0x10,
      length: 4,
      signals: [{ signal: 'EngineRPM', offset: 0 }],
    },
  ],
};

beforeEach(() => {
  setActivePinia(createPinia());
  postMessageMock.mockClear();
  triggerInbound.fn = null;
});

describe('ldfStore — 初始状态与 bootstrap', () => {
  it('初始状态干净', () => {
    const store = useLdfStore();
    expect(store.status).toBe('idle');
    expect(store.signals).toEqual([]);
    expect(store.frames).toEqual([]);
    expect(store.pendingSignalChanges).toEqual([]);
    expect(store.pendingFrameChanges).toEqual([]);
    expect(store.errorMessage).toBeNull();
    expect(store.saveErrorMessage).toBeNull();
  });

  it('bootstrap 注册监听并发送 ready', () => {
    const store = useLdfStore();
    store.bootstrap();
    expect(triggerInbound.fn).not.toBeNull();
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'ready' });
  });
});

describe('ldfStore — Extension → WebView 消息处理', () => {
  it('loading 消息 → status=loading,清空错误', () => {
    const store = useLdfStore();
    store.bootstrap();
    store.errorMessage = 'old error';
    triggerInbound.fn!({ type: 'loading' });
    expect(store.status).toBe('loading');
    expect(store.errorMessage).toBeNull();
  });

  it('ok 消息 → 写入 payload + 清空 pending changes + status=ready', () => {
    const store = useLdfStore();
    store.bootstrap();
    // 制造一些 pending 让 ok 之后能验证清空
    store.pendingSignalChanges.push({
      _action: 'create',
      data: { name: 'X', width: 8, init_value: 0 },
    });

    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    expect(store.status).toBe('ready');
    expect(store.overview).toEqual(samplePayload.overview);
    expect(store.signals).toHaveLength(2);
    expect(store.frames).toHaveLength(1);
    expect(store.pendingSignalChanges).toEqual([]);
    expect(store.pendingFrameChanges).toEqual([]);
    expect(store.errorMessage).toBeNull();
    expect(store.saveErrorMessage).toBeNull();
  });

  it('error 消息 → errorMessage + status=error', () => {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'error', payload: 'parse failed' });
    expect(store.status).toBe('error');
    expect(store.errorMessage).toBe('parse failed');
  });

  it('saveError 消息 → saveErrorMessage 但不改 status', () => {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    triggerInbound.fn!({ type: 'saveError', payload: 'disk full' });
    expect(store.saveErrorMessage).toBe('disk full');
    expect(store.status).toBe('ready');
  });
});

describe('ldfStore — 信号 CRUD', () => {
  function loadedStore() {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    return store;
  }

  it('createSignal 追加 pending change(create)', () => {
    const store = loadedStore();
    store.createSignal({ name: 'NewSig', width: 4, init_value: 1 });
    expect(store.pendingSignalChanges).toHaveLength(1);
    expect(store.pendingSignalChanges[0]._action).toBe('create');
    expect(store.pendingSignalChanges[0].data.name).toBe('NewSig');
  });

  it('createSignal 重名时抛错', () => {
    const store = loadedStore();
    expect(() =>
      store.createSignal({ name: 'EngineRPM', width: 4, init_value: 1 })
    ).toThrowError(/exist|duplicate/i);
  });

  it('createSignal 校验失败抛错且不写入 pending', () => {
    const store = loadedStore();
    expect(() =>
      store.createSignal({ name: 'Bad', width: 100, init_value: 0 })
    ).toThrow();
    expect(store.pendingSignalChanges).toHaveLength(0);
  });

  it('updateSignal 修改原始信号 → pending change(update)', () => {
    const store = loadedStore();
    store.updateSignal('EngineRPM', { init_value: 42 });
    expect(store.pendingSignalChanges).toHaveLength(1);
    expect(store.pendingSignalChanges[0]._action).toBe('update');
    expect(store.pendingSignalChanges[0].data.init_value).toBe(42);
  });

  it('updateSignal 同一信号多次更新只保留最新一条 update', () => {
    const store = loadedStore();
    store.updateSignal('EngineRPM', { init_value: 42 });
    store.updateSignal('EngineRPM', { init_value: 99 });
    const changes = store.pendingSignalChanges.filter(
      (c) => c.data.name === 'EngineRPM'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].data.init_value).toBe(99);
  });

  it('updateSignal 修改新建项时保持 _action=create', () => {
    const store = loadedStore();
    store.createSignal({ name: 'Tmp', width: 4, init_value: 0 });
    store.updateSignal('Tmp', { init_value: 7 });
    const changes = store.pendingSignalChanges.filter(
      (c) => c.data.name === 'Tmp'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]._action).toBe('create');
    expect(changes[0].data.init_value).toBe(7);
  });

  it('markSignalDeleted 追加 delete 但保留 signals 数组中的原对象', () => {
    const store = loadedStore();
    store.markSignalDeleted('EngineRPM');
    expect(store.signalRowState('EngineRPM')).toBe('deleted');
    // 不能从 signals 物理移除,视图需要染灰渲染
    expect(store.signals.find((s) => s.name === 'EngineRPM')).toBeDefined();
    expect(store.pendingSignalChanges[0]._action).toBe('delete');
  });

  it('markSignalDeleted 对新建未保存信号 → 直接撤销 pending,不留 delete 残骸', () => {
    const store = loadedStore();
    store.createSignal({ name: 'Tmp', width: 4, init_value: 0 });
    store.markSignalDeleted('Tmp');
    expect(store.pendingSignalChanges.find((c) => c.data.name === 'Tmp')).toBeUndefined();
  });

  it('cancelSignalDelete 撤销 delete 标记', () => {
    const store = loadedStore();
    store.markSignalDeleted('EngineRPM');
    store.cancelSignalDelete('EngineRPM');
    expect(store.signalRowState('EngineRPM')).toBe('unchanged');
  });
});

describe('ldfStore — 帧 CRUD 与信号映射', () => {
  function loadedStore() {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    return store;
  }

  it('createFrame 追加 pending change', () => {
    const store = loadedStore();
    store.createFrame({
      name: 'NewFrame',
      frame_id: 0x20,
      length: 2,
      signals: [],
    });
    expect(store.pendingFrameChanges).toHaveLength(1);
    expect(store.pendingFrameChanges[0]._action).toBe('create');
  });

  it('createFrame 校验失败抛错', () => {
    const store = loadedStore();
    expect(() =>
      store.createFrame({
        name: 'Bad',
        frame_id: 100,
        length: 2,
        signals: [],
      })
    ).toThrow();
  });

  it('updateFrame 同一帧多次更新只保留一条', () => {
    const store = loadedStore();
    store.updateFrame('EngineFrame', { length: 4 });
    store.updateFrame('EngineFrame', { length: 8 });
    const changes = store.pendingFrameChanges.filter(
      (c) => c.data.name === 'EngineFrame'
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].data.length).toBe(8);
  });

  it('addSignalMapping 越界时抛错并不修改帧', () => {
    const store = loadedStore();
    expect(() =>
      // CoolantTemp width=8, frame.length=4 → 32bit; offset=30 + 8 = 38 > 32 越界
      store.addSignalMapping('EngineFrame', 'CoolantTemp', 30)
    ).toThrow();
    const frame = store.frames.find((f) => f.name === 'EngineFrame')!;
    expect(frame.signals).toHaveLength(1);
  });

  it('addSignalMapping 合法时把映射加入帧并标记为 update', () => {
    const store = loadedStore();
    store.addSignalMapping('EngineFrame', 'CoolantTemp', 16);
    const frame = store.frames.find((f) => f.name === 'EngineFrame')!;
    expect(frame.signals).toHaveLength(2);
    expect(store.frameRowState('EngineFrame')).toBe('updated');
  });

  it('removeSignalMapping 删除映射并产生 update', () => {
    const store = loadedStore();
    store.removeSignalMapping('EngineFrame', 'EngineRPM');
    const frame = store.frames.find((f) => f.name === 'EngineFrame')!;
    expect(frame.signals).toHaveLength(0);
    expect(store.frameRowState('EngineFrame')).toBe('updated');
  });

  it('updateSignalOffset 校验越界', () => {
    const store = loadedStore();
    expect(() =>
      store.updateSignalOffset('EngineFrame', 'EngineRPM', 30)
    ).toThrow();
  });

  it('updateSignalOffset 合法时改 offset 并产生 update', () => {
    const store = loadedStore();
    store.updateSignalOffset('EngineFrame', 'EngineRPM', 8);
    const frame = store.frames.find((f) => f.name === 'EngineFrame')!;
    expect(frame.signals[0].offset).toBe(8);
  });

  it('markFrameDeleted 保留对象但标记 delete', () => {
    const store = loadedStore();
    store.markFrameDeleted('EngineFrame');
    expect(store.frameRowState('EngineFrame')).toBe('deleted');
    expect(store.frames.find((f) => f.name === 'EngineFrame')).toBeDefined();
  });
});

describe('ldfStore — getters', () => {
  function loadedStore() {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    return store;
  }

  it('hasPendingChanges 默认 false', () => {
    const store = loadedStore();
    expect(store.hasPendingChanges).toBe(false);
  });

  it('任何 pending change 都让 hasPendingChanges=true', () => {
    const store = loadedStore();
    store.createSignal({ name: 'New', width: 4, init_value: 0 });
    expect(store.hasPendingChanges).toBe(true);
  });

  it('signalRowState 区分 unchanged / created / updated / deleted', () => {
    const store = loadedStore();
    expect(store.signalRowState('EngineRPM')).toBe('unchanged');
    store.updateSignal('EngineRPM', { init_value: 1 });
    expect(store.signalRowState('EngineRPM')).toBe('updated');
    store.createSignal({ name: 'New', width: 4, init_value: 0 });
    expect(store.signalRowState('New')).toBe('created');
    store.markSignalDeleted('CoolantTemp');
    expect(store.signalRowState('CoolantTemp')).toBe('deleted');
  });
});

describe('ldfStore — 全局动作', () => {
  function loadedStore() {
    const store = useLdfStore();
    store.bootstrap();
    triggerInbound.fn!({ type: 'ok', payload: samplePayload });
    return store;
  }

  it('requestRefresh 清空 pending 并发送 requestRefresh', () => {
    const store = loadedStore();
    store.createSignal({ name: 'New', width: 4, init_value: 0 });
    store.requestRefresh();
    expect(store.pendingSignalChanges).toEqual([]);
    expect(store.pendingFrameChanges).toEqual([]);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'requestRefresh' });
  });

  it('saveChanges 把两个 pending 列表打包发送', () => {
    const store = loadedStore();
    store.createSignal({ name: 'New', width: 4, init_value: 0 });
    store.updateFrame('EngineFrame', { length: 8 });
    store.saveChanges();
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'saveChanges',
        payload: expect.objectContaining({
          signals: expect.any(Array),
          frames: expect.any(Array),
        }),
      })
    );
    const lastCall = postMessageMock.mock.calls[postMessageMock.mock.calls.length - 1][0] as Extract<
      OutboundMessage,
      { type: 'saveChanges' }
    >;
    expect(lastCall.payload.signals).toHaveLength(1);
    expect(lastCall.payload.frames).toHaveLength(1);
  });
});
