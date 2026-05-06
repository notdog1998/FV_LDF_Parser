/**
 * WebView SPA 入口 — PRD §9.1 / §9.2
 *
 * - createApp 创建 Vue 3 应用实例。
 * - createPinia 创建 Pinia store 实例。
 * - use(router) / use(pinia) 用插件扩展 App,后续组件里才能使用 useRouter / useLdfStore。
 * - App.vue 作为根组件,负责触发 bootstrap() 并渲染导航 + RouterView。
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
