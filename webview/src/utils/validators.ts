/**
 * 前端校验函数 — 与后端 src/service/{signalService,frameService}.ts 保持一致
 *
 * 同步策略(WHY 这样写,而不是从后端 import):
 * - webview/ 是独立 npm 子工程,Vite 不会编译 src/ 目录,跨工程相对路径会污染依赖图
 *   并破坏 dist/webview 的产物纯净度,因此规则必须以「同源副本」形式存在。
 * - 后端规则改动时,改动者必须同时修改本文件 + tests/validators.test.ts。
 *   后端测试(tests/unit/signalService.test.ts)与前端测试用相同边界值兜底。
 *
 * 设计选择:
 * - 校验函数返回 string | null 而不是抛异常,因为表单 UI 需要把错误显示到字段下方,
 *   抛异常会让 Vue 的事件循环很难做友好提示。
 * - 用 Math.pow(2, width) - 1 计算上界(同后端):位移在 width=64 会溢出成 -1。
 */

import type { LdfFrame, LdfSignal } from '@/types/ldf';

/** 计算给定 width 的 init_value 上界(无符号最大值)。 */
export function computeMaxInitValue(width: number): number {
  return Math.pow(2, width) - 1;
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/** 校验 LdfSignal,合法返回 null,违规返回错误消息。 */
export function validateSignal(signal: LdfSignal): string | null {
  if (!signal.name || signal.name.trim() === '') {
    return 'name is required';
  }
  if (!isInteger(signal.width)) {
    return `width must be an integer, got ${signal.width}`;
  }
  if (signal.width < 1 || signal.width > 64) {
    return `width must be between 1 and 64, got ${signal.width}`;
  }
  if (!isInteger(signal.init_value)) {
    return `init_value must be an integer, got ${signal.init_value}`;
  }
  const maxValue = computeMaxInitValue(signal.width);
  if (signal.init_value < 0 || signal.init_value > maxValue) {
    return `init_value must be between 0 and ${maxValue} for width ${signal.width}, got ${signal.init_value}`;
  }
  return null;
}

/** 校验 LdfFrame 自身字段(不校验 signals 映射,映射用 validateMapping)。 */
export function validateFrame(frame: LdfFrame): string | null {
  if (!frame.name || frame.name.trim() === '') {
    return 'name is required';
  }
  if (!isInteger(frame.frame_id)) {
    return `frame_id must be an integer, got ${frame.frame_id}`;
  }
  if (frame.frame_id < 0 || frame.frame_id > 63) {
    return `frame_id must be between 0 and 63, got ${frame.frame_id}`;
  }
  if (!isInteger(frame.length)) {
    return `length must be an integer, got ${frame.length}`;
  }
  if (frame.length < 1 || frame.length > 8) {
    return `length must be between 1 and 8 bytes, got ${frame.length}`;
  }
  return null;
}

/**
 * 校验「在某帧的 offset 处放入 width 位的信号」是否越界。
 *
 * 规则: offset >= 0 且 offset + width <= frameLength * 8。
 */
export function validateMapping(
  signalWidth: number,
  offset: number,
  frameLength: number
): string | null {
  if (!isInteger(offset) || offset < 0) {
    return `offset must be a non-negative integer, got ${offset}`;
  }
  const frameBits = frameLength * 8;
  if (offset + signalWidth > frameBits) {
    return `mapping exceeds frame capacity: offset ${offset} + width ${signalWidth} > ${frameBits} bits`;
  }
  return null;
}
