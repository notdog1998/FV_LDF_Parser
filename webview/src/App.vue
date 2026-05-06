/**
 * App.vue — WebView 根组件(PR-01 / FR-02 / §9.4)
 *
 * 职责:
 * - onMounted 时调用 store.bootstrap(),触发向 Extension 发送 ready 消息并注册监听。
 * - 顶层布局:导航栏(AppNav) + 主内容区(RouterView) + 底部状态条(StatusBar)。
 * - 全局错误屏:errorMessage 非空时遮罩整个内容区,避免半拉 UI 配异常数据。
 * - 加载屏:status=loading 时显示统一 loading UI,RouterView 暂停渲染。
 */

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useLdfStore } from '@/stores/ldfStore';
import AppNav from '@/components/AppNav.vue';
import StatusBar from '@/components/StatusBar.vue';

const store = useLdfStore();

// onMounted 仅在组件挂载后执行一次,正好对应「WebView DOM ready 后再发 ready 消息」的协议语义
onMounted(() => {
  store.bootstrap();
});

// 调试辅助: 当 status 变为 error 时把 error 打出来(不会暴露任何敏感信息)
watch(() => store.status, (s) => {
  if (s === 'error') {
    console.error('[LDF Explorer]', store.errorMessage);
  }
});
</script>

<template>
  <div class="app">
    <AppNav />

    <main class="main">
      <div v-if="store.status === 'loading'" class="overlay overlay--loading">
        ⏳ 正在解析 LDF 文件,请稍候…
      </div>

      <div v-else-if="store.status === 'error'" class="overlay overlay--error">
        <div class="overlay__title">❌ 解析失败</div>
        <pre class="overlay__body">{{ store.errorMessage }}</pre>
      </div>

      <div v-else-if="store.status === 'idle'" class="overlay overlay--idle">
        等待 Extension 响应…
      </div>

      <RouterView v-else />
    </main>

    <StatusBar />
  </div>
</template>

<style>
/* 使用 <style>(非 scoped)让子组件共享基础布局 */
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-foreground, #ccc);
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
}
.main {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}
.overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  font-size: 14px;
  text-align: center;
}
.overlay--loading {
  color: #75beff;
}
.overlay--error {
  color: #f48771;
}
.overlay--idle {
  color: var(--vscode-disabledForeground, #808080);
}
.overlay__title {
  font-weight: 700;
  font-size: 16px;
}
.overlay__body {
  max-width: 80ch;
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
  font-size: 12px;
  line-height: 1.4;
  padding: 8px 12px;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-editor-background, #1e1e1e);
  color: #f48771;
}
</style>
