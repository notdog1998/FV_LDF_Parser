import type { LdfFrame, LdfSignal } from '@/types/ldf';
import { validateMapping } from '@/utils/validators';

/** 一个 signal 在当前 frame 中的可视化占用信息。 */
export interface SignalBandInfo {
  signalName: string;
  width: number;
  offset: number;
  startBit: number;
  endBit: number;
  signal: LdfSignal | undefined;
}

/** 条带被拆分到某一 Byte 行后的片段（用于跨 Byte signal 的渲染）。 */
export interface BandSegment {
  signalName: string;
  width: number;
  offset: number;
  startBit: number;
  endBit: number;
  signal: LdfSignal | undefined;
  byteRow: number;
  startCol: number;
  endCol: number;
}

/**
 * 把 frame 的 signal 映射列表转成可视化 band 信息。
 * width 优先从 signals 数组查找；找不到时退化为 1，避免渲染崩溃。
 */
export function computeSignalBands(
  frame: LdfFrame,
  signals: LdfSignal[]
): SignalBandInfo[] {
  return frame.signals.map((mapping) => {
    const signal = signals.find((s) => s.name === mapping.signal);
    const width = signal?.width ?? 1;
    return {
      signalName: mapping.signal,
      width,
      offset: mapping.offset,
      startBit: mapping.offset,
      endBit: mapping.offset + width - 1,
      signal,
    };
  });
}

/**
 * 把一个 band 按 Byte 边界拆成多行片段。
 * 每 Byte 行从左到右显示 bit 7..0（CANoe 风格，LSB 在右）。
 */
export function splitBandIntoRows(band: SignalBandInfo): BandSegment[] {
  const segments: BandSegment[] = [];
  let currentBit = band.startBit;
  while (currentBit <= band.endBit) {
    const byteRow = Math.floor(currentBit / 8);
    const endOfByte = byteRow * 8 + 7;
    const endBit = Math.min(band.endBit, endOfByte);
    segments.push({
      ...band,
      byteRow,
      startCol: 7 - (currentBit - byteRow * 8),
      endCol: 7 - (endBit - byteRow * 8),
    });
    currentBit = endBit + 1;
  }
  return segments;
}

/** 检测 bands 之间是否存在 bit 重叠。 */
export function checkOverlap(bands: SignalBandInfo[]): string | null {
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i];
      const b = bands[j];
      if (a.startBit <= b.endBit && b.startBit <= a.endBit) {
        return `signal "${a.signalName}" overlaps with "${b.signalName}"`;
      }
    }
  }
  return null;
}

/**
 * 校验把指定 signal 移动到 newOffset 后是否合法（不越界、不重叠）。
 * 返回 null 表示合法，否则返回错误消息。
 */
export function validateDragOffset(
  frame: LdfFrame,
  signals: LdfSignal[],
  signalName: string,
  newOffset: number
): string | null {
  const signal = signals.find((s) => s.name === signalName);
  if (!signal) {
    return `signal not found: ${signalName}`;
  }
  const boundaryErr = validateMapping(signal.width, newOffset, frame.length);
  if (boundaryErr) {
    return boundaryErr;
  }

  const otherBands = frame.signals
    .filter((m) => m.signal !== signalName)
    .map((m) => {
      const s = signals.find((x) => x.name === m.signal);
      const width = s?.width ?? 1;
      return {
        signalName: m.signal,
        width,
        offset: m.offset,
        startBit: m.offset,
        endBit: m.offset + width - 1,
        signal: s,
      };
    });
  const movedBand: SignalBandInfo = {
    signalName,
    width: signal.width,
    offset: newOffset,
    startBit: newOffset,
    endBit: newOffset + signal.width - 1,
    signal,
  };
  return checkOverlap([...otherBands, movedBand]);
}

/** 把水平像素位移转成 bit 偏移量（按 cell 宽度取整）。 */
export function offsetFromDrag(dx: number, cellWidth: number): number {
  return Math.round(dx / cellWidth);
}

/** FNV-1a 风格的简单字符串哈希，用于为 signal 名生成稳定颜色。 */
export function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}

export interface SignalColor {
  background: string;
  foreground: string;
  border: string;
}

/**
 * 为 signal 名生成稳定的分类颜色。
 * 使用中等明度/饱和度的 HSL，在 VS Code 暗色/浅色主题下都保持可读性；
 * 文字固定为白色并带阴影，避免随主题反转。
 */
export function getSignalColor(name: string): SignalColor {
  const hue = hashString(name) % 360;
  return {
    background: `hsl(${hue}, 68%, 52%)`,
    border: `hsl(${hue}, 68%, 38%)`,
    foreground: '#ffffff',
  };
}
