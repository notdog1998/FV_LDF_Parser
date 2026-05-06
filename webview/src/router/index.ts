/**
 * Vue Router 配置 — PRD §9.2 / §9.4
 *
 * 使用 hash 模式(WHY):
 * - WebView 内页面通过 file:// 或 vscode-resource:// 协议加载,
 *   history 模式(依赖 pushState)在 WebView 环境下会导致路径解析异常。
 * - hash 模式的 hashchange 不触发浏览器导航,WebView 内完美工作。
 */

import { createRouter, createWebHashHistory } from 'vue-router';

import OverviewView from '@/views/OverviewView.vue';
import NodesView from '@/views/NodesView.vue';
import SignalsView from '@/views/SignalsView.vue';
import FramesView from '@/views/FramesView.vue';

const routes = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', component: OverviewView, meta: { label: '概览' } },
  { path: '/nodes', component: NodesView, meta: { label: '节点' } },
  { path: '/signals', component: SignalsView, meta: { label: '信号' } },
  { path: '/frames', component: FramesView, meta: { label: '帧' } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
