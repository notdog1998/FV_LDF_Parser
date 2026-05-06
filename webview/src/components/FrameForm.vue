/**
 * FrameForm — 帧编辑表单(FR-04)
 *
 * 字段约束:
 * - name 非空,trim 后提交
 * - frame_id 0–63
 * - length 1–8 byte
 * - publisher 可选
 */

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LdfFrame } from '@/types/ldf';
import { validateFrame } from '@/utils/validators';

interface Props {
  initialData?: LdfFrame;
  submitLabel?: string;
}
const { initialData, submitLabel = '保存' } = defineProps<Props>();

const emit = defineEmits<{ (e: 'submit', data: LdfFrame): void; (e: 'cancel'): void }>();

const name = ref('');
const frameId = ref(0);
const length = ref(1);
const publisher = ref('');
const error = ref<string | null>(null);

watch(
  () => initialData,
  (data) => {
    if (data) {
      name.value = data.name;
      frameId.value = data.frame_id;
      length.value = data.length;
      publisher.value = data.publisher ?? '';
      error.value = null;
    } else {
      name.value = '';
      frameId.value = 0;
      length.value = 1;
      publisher.value = '';
      error.value = null;
    }
  },
  { immediate: true }
);

function onSubmit() {
  const data: LdfFrame = {
    name: name.value.trim(),
    frame_id: frameId.value,
    length: length.value,
    publisher: publisher.value.trim() || undefined,
    signals: initialData ? initialData.signals : [],
  };
  const err = validateFrame(data);
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
      <label>帧 ID (0–63)<input v-model.number="frameId" type="number" min="0" max="63" step="1" /></label>
      <label>长度 (1–8 byte)<input v-model.number="length" type="number" min="1" max="8" step="1" /></label>
    </div>
    <div class="row">
      <label>发布者<input v-model="publisher" /></label>
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
