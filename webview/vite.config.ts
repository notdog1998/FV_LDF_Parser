/**
 * Vite 配置 — 对应 PRD §9.6
 *
 * 关键点(WHY):
 * - base: './'  WebView 加载页面后路径以 vscode-resource:// 协议挂载,绝对路径会失败,必须用相对路径
 * - build.outDir: '../dist/webview'  Extension Host 的 getWebviewContent() 会从这个目录读 index.html
 * - build.emptyOutDir: true          每次构建前清空旧产物,避免遗留旧 hash 导致 CSP 拒绝
 * - test.environment: 'happy-dom'    组件测试需要 DOM,Pinia store 也依赖 window/addEventListener
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/main.ts',
        'src/App.vue',
        'src/views/**/*.vue',
        'src/components/AppNav.vue',
        'src/components/ConfirmDialog.vue',
        'src/components/FrameForm.vue',
        'src/components/SignalForm.vue',
        'src/components/SignalMappingEditor.vue',
        'src/components/StatusBar.vue',
      ],
    },
  },
});
