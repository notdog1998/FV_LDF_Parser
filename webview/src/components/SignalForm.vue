/**
 * SignalForm — 信号编辑表单(FR-03)
 *
 * 支持两种模式(通过 initialData 区分):
 * - 新建: name 可编辑,提交时调用 store.createSignal
 * - 更新: name 只读(作为 key 不可改),提交时调用 store.updateSignal
 *
 * 字段约束:
 * - name 非空,trim 后提交
 * - width 1–64,init_value 非负且 <= 2^width - 1
 * - publisher 可为空;subscribers 是逗号分隔的字符串,trim 后按名拆分为数组
 *   空字符串 → undefined
 */

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LdfSignal } from '@/types/ldf';
import { validateSignal } from '@/utils/validators';

interface Props {
  initialData?: LdfSignal;
  submitLabel?: string;
}
const { initialData, submitLabel = '保存' } = defineProps<Props>();

const emit = defineEmits<{ (e: 'submit', data: LdfSignal): void; (e: 'cancel'): void }>();

// ref 创建响应式原始值,表单字段绑定在 .value 上
const name = ref('');
const width = ref(8);
const initValue = ref(0);
const publisher = ref('');
const subscribers = ref('');
const error = ref<string | null>(null);

// 当 initialData 变化时回填字段(编辑模式)
watch(
  () => initialData,
  (data) => {
    if (data) {
      name.value = data.name;
      width.value = data.width;
      initValue.value = data.init_value;
      publisher.value = data.publisher ?? '';
      subscribers.value = data.subscribers?.join(', ') ?? '';
      error.value = null;
    } else {
      name.value = '';
      width.value = 8;
      initValue.value = 0;
      publisher.value = '';
      subscribers.value = '';
      error.value = null;
    }
  },
  { immediate: true }
);

function onWidthChange() {
  const max = Math.pow(2, width.value) - 1;
  if (initValue.value > max) {
    initValue.value = max;
  }
}

function onSubmit() {
  const rawSubs = subscribers.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const data: LdfSignal = {
    name: name.value.trim(),
    width: width.value,
    init_value: initValue.value,
    publisher: publisher.value.trim() || undefined,
    subscribers: rawSubs.length ? rawSubs : undefined,
  };
  const err = validateSignal(data);
  if (err) {
    error.value = err;
    return;
  }
  error.value = null;
  emit('submit', data);
}

function onCancel() {
  emit('cancel');
}
</script>

<template>
  <form class="form" @submit.prevent="onSubmit">
    <div class="row">
      <label>名称<input v-model="name" :disabled="!!initialData" /></label>
    </div>
    <div class="row row--half">
      <label>位宽 (1–64)<input
        v-model.number="width"
        type="number"
        min="1"
        max="64"
        step="1"
        @change="onWidthChange"
      /></label>
      <label>初始值<input
        v-model.number="initValue"
        type="number"
        min="0"
      /></label>
    </div>
    <div class="row">
      <label>发布者<input v-model="publisher" /></label>
    </div>
    <div class="row">
      <label>订阅者 (逗号分隔)<input v-model="subscribers" /></label>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="actions">
      <button type="submit" class="btn btn--primary">{{ submitLabel }}</button>
      <button type="button" class="btn btn--secondary" @click="onCancel">取消</button>
    </div>
  </form>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; flex-direction: column; gap: 4px; }
.row--half { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
label { font-size: 12px; color: var(--vscode-descriptionForeground, #808080); }
input {
  padding: 4px 8px;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 2px;
  font-size: 13px;
}
input:disabled { opacity: 0.6; cursor: not-allowed; }
input:focus { outline: 1px solid var(--vscode-focusBorder, #0078d4); }
.error { color: #f48771; font-size: 12px; }
.actions { display: flex; gap: 8px; margin-top: 4px; }
.btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
}
.btn--primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}
.btn--secondary {
  background: var(--vscode-button-secondaryBackground, #3c3c3c);
  color: var(--vscode-button-secondaryForeground, #ccc);
}
.btn:hover { filter: brightness(1.15); }
</style>
