/**
 * StatusBar — 底部状态条(PR-01 / FR-05 / §9.4)
 *
 * 显示内容优先级:
 * 1. 错误消息(error / saveError) — 红底白字,不可忽略
 * 2. 加载中 — 蓝底文字
 * 3. 就绪 — pending 数量提示(若有)
 * 4. idle — 空白
 */

<script setup lang="ts">
import { useLdfStore } from '@/stores/ldfStore';
import { storeToRefs } from 'pinia'; // storeToRefs 把 store 中的 ref 转换成本地 ref,保持响应式同时自动解包

const store = useLdfStore();
const { status, errorMessage, saveErrorMessage, hasPendingChanges } = storeToRefs(store);

function clearSaveError() {
  store.saveErrorMessage = null;
}
</script>

<template>
  <div class="status-bar">
    <div v-if="errorMessage" class="status-bar__error">
      ❌ {{ errorMessage }}
    </div>
    <div v-else-if="saveErrorMessage" class="status-bar__save-error">
      💾 保存失败: {{ saveErrorMessage }}
      <button class="close-btn" @click="clearSaveError">✕</button>
    </div>
    <div v-else-if="status === 'loading'" class="status-bar__loading">
      ⏳ 正在加载…
    </div>
    <div v-else-if="status === 'ready' && hasPendingChanges" class="status-bar__pending">
      ⚡ 有未保存的变更,点击「保存」写入文件
    </div>
    <div v-else-if="status === 'ready'" class="status-bar__ok">
      ✔ 就绪
    </div>
    <div v-else class="status-bar__idle"></div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 12px;
  border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
  background: var(--vscode-statusBar-background, #1e1e1e);
  color: var(--vscode-statusBar-foreground, #ccc);
}
.status-bar__error {
  color: #f48771;
  font-weight: 600;
}
.status-bar__save-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f48771;
  font-weight: 600;
}
.status-bar__loading {
  color: #75beff;
}
.status-bar__pending {
  color: #cca700;
}
.status-bar__ok {
  color: #89d185;
}
.close-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
}
</style>
