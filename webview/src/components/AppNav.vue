/**
 * AppNav — 顶部导航栏(PR-01 / FR-05 / §9.4)
 *
 * - 左侧 4 个 RouterLink Tab: 概览、节点、信号、帧
 * - 右侧全局按钮:「保存」「刷新」;有 pending 时刷新按钮额外强调「将丢弃未保存改动」
 * - 通过 useRoute 获取当前 route 来高亮当前 tab
 */

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useLdfStore } from '@/stores/ldfStore';
import ConfirmDialog from './ConfirmDialog.vue';

const route = useRoute(); // useRoute 返回当前激活的 RouteLocationNormalized,通过 path 判断高亮
const store = useLdfStore();

const showRefreshConfirm = ref(false);

// RouterLink 到 `/overview` 时 route.path 也是 `/overview`,直接比较 path 即可
function isActive(path: string) {
  return route.path === path;
}

const tabs = [
  { path: '/overview', label: '概览' },
  { path: '/nodes', label: '节点' },
  { path: '/signals', label: '信号' },
  { path: '/frames', label: '帧' },
];

const refreshButtonText = computed(() =>
  store.hasPendingChanges ? '刷新(丢弃未保存)' : '刷新'
);

function onSave() {
  store.saveChanges();
}

function onRefreshClick() {
  showRefreshConfirm.value = true;
}

function onRefreshConfirm() {
  showRefreshConfirm.value = false;
  store.requestRefresh();
}

function onRefreshCancel() {
  showRefreshConfirm.value = false;
}
</script>

<template>
  <nav class="app-nav">
    <ul class="tabs">
      <li v-for="tab in tabs" :key="tab.path">
        <RouterLink
          :to="tab.path"
          :class="['tab', { active: isActive(tab.path) }]"
        >
          {{ tab.label }}
        </RouterLink>
      </li>
    </ul>

    <div class="actions">
      <button
        class="btn btn--primary"
        :disabled="!store.hasPendingChanges"
        @click="onSave"
      >
        💾 保存
      </button>
      <button
        class="btn"
        :class="store.hasPendingChanges ? 'btn--danger' : 'btn--secondary'"
        @click="onRefreshClick"
      >
        🔄 {{ refreshButtonText }}
      </button>
    </div>

    <ConfirmDialog
      :visible="showRefreshConfirm"
      title="确认刷新"
      message="刷新将放弃所有未保存的变更,确定继续?"
      confirm-text="确认刷新"
      danger
      @confirm="onRefreshConfirm"
      @cancel="onRefreshCancel"
    />
  </nav>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 36px;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
  background: var(--vscode-editor-background, #1e1e1e);
}
.tabs {
  display: flex;
  list-style: none;
  gap: 4px;
  margin: 0;
  padding: 0;
}
.tab {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  text-decoration: none;
  color: var(--vscode-foreground, #ccc);
  border-radius: 2px;
  border-bottom: 2px solid transparent;
}
.tab:hover {
  background: var(--vscode-list-hoverBackground, #2a2d2e);
}
.tab.active {
  color: var(--vscode-foreground, #fff);
  border-bottom-color: var(--vscode-focusBorder, #0078d4);
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 8px;
}
.btn {
  font-size: 11px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
}
.btn--primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}
.btn--primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn--secondary {
  background: var(--vscode-button-secondaryBackground, #3c3c3c);
  color: var(--vscode-button-secondaryForeground, #ccc);
}
.btn--danger {
  background: #a31515;
  color: #fff;
}
.btn:hover:not(:disabled) {
  filter: brightness(1.15);
}
</style>
