/**
 * ConfirmDialog — 通用确认弹窗(FR-05)
 *
 * 刷新按钮和「关闭未保存面板」复用此组件。
 * - 通过 defineEmits 向父组件发送 confirm / cancel 事件。
 * - visible 由父组件通过 props 控制。
 */

<script setup lang="ts">
interface Props {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
}

const { visible, title = '确认', message = '', confirmText = '确认', danger = false } = defineProps<Props>();
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>();

function onBackdropClick() {
  emit('cancel');
}
function onConfirm() {
  emit('confirm');
}
function onCancel() {
  emit('cancel');
}
</script>

<template>
  <div v-if="visible" class="dialog-backdrop" @click="onBackdropClick">
    <div class="dialog" @click.stop>
      <div class="dialog__header">{{ title }}</div>
      <div class="dialog__body">{{ message }}</div>
      <div class="dialog__footer">
        <button class="btn btn--secondary" @click="onCancel">取消</button>
        <button
          class="btn"
          :class="danger ? 'btn--danger' : 'btn--primary'"
          @click="onConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
}
.dialog {
  min-width: 320px;
  max-width: 480px;
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-foreground, #ccc);
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 6px;
  padding: 16px 20px;
}
.dialog__header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.dialog__body {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 16px;
  white-space: pre-wrap;
}
.dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  background: var(--vscode-button-secondaryBackground, #3c3c3c);
  color: var(--vscode-button-secondaryForeground, #ccc);
}
.btn--primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}
.btn--danger {
  background: #a31515;
  color: #fff;
}
.btn--secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground, #4c4c4c);
}
.btn--primary:hover {
  background: var(--vscode-button-hoverBackground, #1177bb);
}
</style>
