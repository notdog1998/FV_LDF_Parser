/**
 * api/vscode.ts 单元测试 — PRD §9.2
 *
 * 因为 api/vscode.ts 依赖 window.acquireVsCodeApi(仅 VS Code WebView 环境存在),
 * 测试里手动模拟全局,验证 postMessage 与 onMessage 的基本行为。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  // 每次测试前重置模块缓存,确保 __resetVsCodeApiForTest 生效
  vi.resetModules();
  // 清理全局
  delete (window as any).acquireVsCodeApi;
});

async function loadApi() {
  const mod = await import('@/api/vscode');
  return mod;
}

describe('postMessage', () => {
  it('WebView 环境下调用 api.postMessage', async () => {
    const postMock = vi.fn();
    (window as any).acquireVsCodeApi = () => ({ postMessage: postMock });
    const { postMessage } = await loadApi();
    postMessage({ type: 'ready' });
    expect(postMock).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('非 WebView 环境静默忽略', async () => {
    const { postMessage } = await loadApi();
    // 不应抛错
    expect(() => postMessage({ type: 'ready' })).not.toThrow();
  });
});

describe('onMessage', () => {
  it('收到符合协议的 message 触发 handler', async () => {
    const { onMessage } = await loadApi();
    const handler = vi.fn();
    const unsub = onMessage(handler);

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'ok', payload: {} } })
    );
    expect(handler).toHaveBeenCalledWith({ type: 'ok', payload: {} });

    unsub();
  });

  it('忽略 data 非对象的消息', async () => {
    const { onMessage } = await loadApi();
    const handler = vi.fn();
    const unsub = onMessage(handler);

    window.dispatchEvent(new MessageEvent('message', { data: 'string' }));
    expect(handler).not.toHaveBeenCalled();

    unsub();
  });

  it('unsubscribe 后不再触发', async () => {
    const { onMessage } = await loadApi();
    const handler = vi.fn();
    const unsub = onMessage(handler);
    unsub();

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'error', payload: '' } })
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
