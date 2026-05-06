/**
 * OverviewView — 概览页(FR-02)
 *
 * 只读展示 overview 的 5 个字段:协议版本、语言版本、波特率、校验模型、通道。
 * store 还未就绪(overview=null)时显示空占位。
 */

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useLdfStore } from '@/stores/ldfStore';

const store = useLdfStore();
const { overview } = storeToRefs(store);

const fields = [
  { key: 'protocol_version', label: '协议版本' },
  { key: 'language_version', label: '语言版本' },
  { key: 'baudrate', label: '波特率' },
  { key: 'checksum_model', label: '校验模型' },
  { key: 'channel', label: '通道' },
] as const;

function value(key: string): string {
  if (!overview.value) return '—';
  const raw = overview.value[key as keyof typeof overview.value];
  return raw !== undefined && raw !== null ? String(raw) : '—';
}
</script>

<template>
  <div class="overview">
    <h2>LDF 概览</h2>
    <div class="card">
      <div
        v-for="f in fields"
        :key="f.key"
        class="field"
      >
        <span class="field__label">{{ f.label }}</span>
        <span class="field__value">{{ value(f.key) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  font-size: 16px;
  margin: 0 0 12px;
  font-weight: 600;
}
.card {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  padding: 12px 16px;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-editor-background, #1e1e1e);
}
.field {
  display: contents;
}
.field__label {
  color: var(--vscode-descriptionForeground, #808080);
  font-size: 12px;
}
.field__value {
  font-size: 13px;
  font-weight: 500;
  font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
}
</style>
