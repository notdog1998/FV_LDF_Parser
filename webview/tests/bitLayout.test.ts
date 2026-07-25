import { describe, it, expect } from 'vitest';
import {
  computeSignalBands,
  getSignalColor,
  hashString,
  offsetFromDrag,
  splitBandIntoRows,
  validateDragOffset,
} from '@/utils/bitLayout';
import type { LdfFrame, LdfSignal } from '@/types/ldf';

const signals: LdfSignal[] = [
  { name: 'SigA', width: 3, init_value: 0 },
  { name: 'SigB', width: 8, init_value: 0 },
  { name: 'SigC', width: 16, init_value: 0 },
];

const frame: LdfFrame = {
  name: 'TestFrame',
  frame_id: 0x10,
  length: 4,
  signals: [
    { signal: 'SigA', offset: 0 },
    { signal: 'SigC', offset: 8 },
  ],
};

describe('computeSignalBands', () => {
  it('计算每个 signal 的 start/end bit', () => {
    const bands = computeSignalBands(frame, signals);
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({
      signalName: 'SigA',
      width: 3,
      offset: 0,
      startBit: 0,
      endBit: 2,
    });
    expect(bands[1]).toMatchObject({
      signalName: 'SigC',
      width: 16,
      offset: 8,
      startBit: 8,
      endBit: 23,
    });
  });

  it('找不到 signal 定义时退化为 width=1', () => {
    const f: LdfFrame = {
      ...frame,
      signals: [{ signal: 'Missing', offset: 5 }],
    };
    const bands = computeSignalBands(f, signals);
    expect(bands[0].width).toBe(1);
    expect(bands[0].endBit).toBe(5);
  });
});

describe('splitBandIntoRows', () => {
  it('不跨 Byte 的 band 产生单个片段', () => {
    const band = computeSignalBands(frame, signals)[0]; // SigA bits 0-2
    const segments = splitBandIntoRows(band);
    expect(segments).toHaveLength(1);
    // startCol 对应 startBit（bit 0 在最右侧，col=7）
    expect(segments[0]).toMatchObject({
      byteRow: 0,
      startCol: 7,
      endCol: 5,
    });
  });

  it('跨 Byte 的 band 拆成多个片段', () => {
    const band = computeSignalBands(frame, signals)[1]; // SigC bits 8-23
    const segments = splitBandIntoRows(band);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      byteRow: 1,
      startCol: 7,
      endCol: 0,
    });
    expect(segments[1]).toMatchObject({
      byteRow: 2,
      startCol: 7,
      endCol: 0,
    });
  });

  it('从 Byte 中间开始并跨 Byte 的 band 位置正确', () => {
    const f: LdfFrame = {
      ...frame,
      signals: [{ signal: 'SigC', offset: 6 }],
    };
    const band = computeSignalBands(f, signals)[0];
    const segments = splitBandIntoRows(band); // bits 6-21
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({
      byteRow: 0,
      startCol: 1, // bit 6 -> col 1
      endCol: 0,   // bit 7 -> col 0
    });
    expect(segments[1]).toMatchObject({
      byteRow: 1,
      startCol: 7,
      endCol: 0,
    });
    expect(segments[2]).toMatchObject({
      byteRow: 2,
      startCol: 7, // bit 16 -> col 7
      endCol: 2,   // bit 21 -> col 2
    });
  });
});

describe('validateDragOffset', () => {
  it('合法 offset 返回 null', () => {
    expect(validateDragOffset(frame, signals, 'SigA', 3)).toBeNull();
  });

  it('越界返回错误', () => {
    expect(validateDragOffset(frame, signals, 'SigA', 30)).toMatch(/exceed|capacity|frame/i);
  });

  it('与其他 signal 重叠返回错误', () => {
    // SigA width=3, 放到 offset=7 会占用 7-9，与 SigC(8-23) 重叠
    expect(validateDragOffset(frame, signals, 'SigA', 7)).toMatch(/overlap/i);
  });

  it('不存在的 signal 返回错误', () => {
    expect(validateDragOffset(frame, signals, 'Missing', 0)).toMatch(/not found/i);
  });
});

describe('offsetFromDrag', () => {
  it('按 cell 宽度四舍五入', () => {
    expect(offsetFromDrag(0, 20)).toBe(0);
    expect(offsetFromDrag(10, 20)).toBe(1);
    expect(offsetFromDrag(-15, 20)).toBe(-1);
    expect(offsetFromDrag(30, 20)).toBe(2);
  });
});

describe('getSignalColor', () => {
  it('同名 signal 颜色稳定', () => {
    const a = getSignalColor('EngineRPM');
    const b = getSignalColor('EngineRPM');
    expect(a.background).toBe(b.background);
  });

  it('不同 signal 颜色不同概率极高', () => {
    const a = getSignalColor('A');
    const b = getSignalColor('B');
    expect(a.background).not.toBe(b.background);
  });
});

describe('hashString', () => {
  it('空字符串返回 FNV-1a 初始值', () => {
    expect(hashString('')).toBe(0x811c9dc5);
  });

  it('相同输入输出相同', () => {
    expect(hashString('test')).toBe(hashString('test'));
  });
});
