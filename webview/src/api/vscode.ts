/**
 * VS Code WebView API 单例封装(对应 PRD §9.2)
 *
 * 关键约束(WHY):
 * - acquireVsCodeApi() 在整个 WebView 生命周期里**只能调用一次**,VS Code 文档明确说
 *   重复调用会抛 "An instance of the VS Code API has already been retrieved"。
 *   因此用模块级闭包缓存第一次拿到的 api 句柄。
 * - 单元测试在 happy-dom 环境运行,window 上不存在 acquireVsCodeApi。本模块允许在
 *   缺失时退化成「空实现」让测试可以 import 通过,但真正发消息会被静默吞掉。
 * - onMessage 用 window.addEventListener('message') 监听,VS Code 把
 *   Extension Host 下发的消息塞在 MessageEvent.data 里。
 */

import type { InboundMessage, OutboundMessage } from '@/types/ldf';

interface VsCodeApi {
  postMessage(message: OutboundMessage): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): T;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let cachedApi: VsCodeApi | null = null;

/** 返回 VS Code WebView API 单例;非 WebView 环境(测试)返回 null。 */
function getApi(): VsCodeApi | null {
  if (cachedApi) {
    return cachedApi;
  }
  if (typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
    cachedApi = window.acquireVsCodeApi();
    return cachedApi;
  }
  return null;
}

/** 向 Extension Host 发送消息;在非 WebView 环境会被静默忽略以便测试。
 *
 * WHY 深拷贝:
 * Pinia store 中的数组/对象被 Vue 3 包装成深层 Proxy。即使浅拷贝({...obj}),
 * 嵌套属性(如 subscribers、frame.signals)仍是 Proxy,直接传给 postMessage
 * 会触发 DataCloneError。因此发送前通过 JSON 序列化做一次深克隆,
 * 确保 MessagePort 收到的是纯 JS 对象。(PRD §9.2)
 */
export function postMessage(message: OutboundMessage): void {
  const api = getApi();
  if (api) {
    api.postMessage(JSON.parse(JSON.stringify(message)));
  }
}

/**
 * 注册 Extension Host → WebView 的消息监听器。
 *
 * 返回一个 unsubscribe 函数,Pinia store 在 dispose 时调用以避免内存泄漏。
 */
export function onMessage(handler: (message: InboundMessage) => void): () => void {
  const listener = (event: MessageEvent): void => {
    // VS Code 用 postMessage 把消息打包在 event.data 里;data 在测试环境也可能是 undefined。
    const data = event.data as InboundMessage | undefined;
    if (data && typeof data === 'object' && typeof data.type === 'string') {
      handler(data);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * 仅供测试使用 — 重置缓存的 api 句柄。
 *
 * 真实 WebView 环境永远不应该调用此函数,因为 acquireVsCodeApi 第二次调用会抛错。
 */
export function __resetVsCodeApiForTest(): void {
  cachedApi = null;
}
