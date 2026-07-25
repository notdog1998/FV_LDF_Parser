/**
 * SignalMappingEditor — 帧内信号映射编辑器(FR-04)
 *
 * 职责:
 * - 展示当前帧已有的信号映射列表
 * - 添加新映射:下拉选择信号 + offset 输入,校验 offset + width ≤ length*8
 * - 修改 offset:行内编辑,校验同上
 * - 删除映射:从帧中移除
 *
 * 外部通过 emit 让父组件调用 store action,本组件不直接访问 store,
 * 保持纯展示/交互,便于单元测试。
 */

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { LdfFrame, LdfSignal } from '@/types/ldf';
import { checkSignalOverlap, validateMapping } from '@/utils/validators';

interface Props {
  frame: LdfFrame;
  signals: LdfSignal[];
}
const { frame, signals } = defineProps<Props>();

const emit = defineEmits<{
  (e: 'addMapping', signalName: string, offset: number): void;
  (e: 'removeMapping', signalName: string): void;
  (e: 'updateOffset', signalName: string, offset: number): void;
}>();

// 新增映射的临时状态
const selectedSignal = ref('');
const newOffset = ref(0);
const newError = ref<string | null>(null);

// 行内编辑 offset 的临时状态
const editingSignal = ref<string | null>(null);
const editOffset = ref(0);
const editError = ref<string | null>(null);

const signalOptions = computed(() =>
  signals.filter(
    (s) => !frame.signals.some((m) => m.signal === s.name)
  )
);

function onAdd() {
  const sig = signals.find((s) => s.name === selectedSignal.value);
  if (!sig) {
    newError.value = '请选择信号';
    return;
  }
  const err = validateMapping(sig.width, newOffset.value, frame.length);
  if (err) {
    newError.value = err;
    return;
  }
  const addFrame: LdfFrame = {
    ...frame,
    signals: [...frame.signals, { signal: sig.name, offset: newOffset.value }],
  };
  const overlap = checkSignalOverlap(addFrame, signals);
  if (overlap) {
    newError.value = overlap;
    return;
  }
  newError.value = null;
  emit('addMapping', sig.name, newOffset.value);
  selectedSignal.value = '';
  newOffset.value = 0;
}

function startEditOffset(signalName: string, currentOffset: number) {
  editingSignal.value = signalName;
  editOffset.value = currentOffset;
  editError.value = null;
}

function onSaveOffset(signalName: string) {
  const sig = signals.find((s) => s.name === signalName);
  if (!sig) return;
  const err = validateMapping(sig.width, editOffset.value, frame.length);
  if (err) {
    editError.value = err;
    return;
  }
  const updateFrame: LdfFrame = {
    ...frame,
    signals: frame.signals.map((m) =>
      m.signal === signalName ? { signal: signalName, offset: editOffset.value } : m
    ),
  };
  const overlap = checkSignalOverlap(updateFrame, signals);
  if (overlap) {
    editError.value = overlap;
    return;
  }
  editError.value = null;
  emit('updateOffset', signalName, editOffset.value);
  editingSignal.value = null;
}

function onCancelEdit() {
  editingSignal.value = null;
  editError.value = null;
}

function onRemove(signalName: string) {
  emit('removeMapping', signalName);
}
</script>

<template>
  <div class="editor">
    <h4>信号映射</h4>

    <!-- 已有映射列表 -->
    <table v-if="frame.signals.length" class="table">
      <thead>
        <tr>
          <th>信号</th>
          <th>位宽</th>
          <th>偏移 (bit)</th>
          <th>占用</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in frame.signals" :key="m.signal">
          <td>{{ m.signal }}</td>
          <td>{{ signals.find((s) => s.name === m.signal)?.width ?? '?' }}</td>
          <td>
            <template v-if="editingSignal === m.signal">
              <input
                v-model.number="editOffset"
                class="small-input"
                type="number"
                min="0"
              />
              <span v-if="editError" class="inline-error">{{ editError }}</span>
            </template>
            <template v-else>
              {{ m.offset }}
            </template>
          </td>
          <td>
            {{ m.offset }}–{{ m.offset + (signals.find((s) => s.name === m.signal)?.width ?? 0) - 1 }}
          </td>
          <td class="actions">
            <template v-if="editingSignal === m.signal">
              <button class="btn btn--text" @click="onSaveOffset(m.signal)">保存</button>
              <button class="btn btn--text" @click="onCancelEdit">取消</button>
            </template>
            <template v-else>
              <button class="btn btn--text" @click="startEditOffset(m.signal, m.offset)">改偏移</button>
              <button class="btn btn--text btn--danger" @click="onRemove(m.signal)">移除</button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无信号映射</div>

    <!-- 添加映射 -->
    <div v-if="signalOptions.length" class="add-row">
      <select v-model="selectedSignal" class="small-select">
        <option disabled value="">选择信号</option>
        <option v-for="s in signalOptions" :key="s.name" :value="s.name">
          {{ s.name }} ({{ s.width }} bit)
        </option>
      </select>
      <input
        v-model.number="newOffset"
        class="small-input"
        type="number"
        min="0"
        :placeholder="`偏移(0–${frame.length * 8 - 1})`"
      />
      <button class="btn btn--primary" @click="onAdd">添加</button>
    </div>
    <div v-else-if="signals.length" class="empty">所有信号已映射</div>
    <div v-else class="empty">请先创建信号</div>
    <div v-if="newError" class="error">{{ newError }}</div>
  </div>
</template>

<style scoped>
.editor { padding: 8px 0; }
h4 { font-size: 12px; margin: 0 0 8px; font-weight: 600; }
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 8px;
}
.table th, .table td {
  padding: 4px 6px;
  text-align: left;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.table th {
  color: var(--vscode-descriptionForeground, #808080);
  font-weight: 600;
}
.empty {
  font-size: 12px;
  color: var(--vscode-disabledForeground, #808080);
  margin-bottom: 8px;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.small-input, .small-select {
  padding: 3px 6px;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 2px;
  font-size: 12px;
  min-width: 80px;
}
.small-select { min-width: 140px; }
.actions { display: flex; gap: 6px; }
.btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
}
.btn--primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}
.btn--text {
  background: transparent;
  color: var(--vscode-textLink-foreground, #3794ff);
  padding: 2px 4px;
}
.btn--danger { color: #f48771; }
.btn:hover { filter: brightness(1.15); }
.inline-error {
  display: block;
  color: #f48771;
  font-size: 11px;
}
.error { color: #f48771; font-size: 12px; margin-top: 4px; }
</style>
