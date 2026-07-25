/**
 * 校验函数单元测试 — 与后端 src/service/{signalService,frameService}.ts 的校验规则保持一致
 *
 * 后端在 _validateSignal / _validateFrame / _validateMapping 中定义了权威规则;
 * 前端 validators 是这些规则的「同源副本」(注释里写明同步策略)。本测试套用与后端
 * 测试相同的边界值,如果某天后端规则改了,这里会立刻红。
 */

import { describe, it, expect } from 'vitest';
import {
  validateSignal,
  validateFrame,
  validateMapping,
  computeMaxInitValue,
  checkSignalOverlap,
} from '@/utils/validators';
import type { LdfFrame, LdfSignal } from '@/types/ldf';

const baseSignal: LdfSignal = {
  name: 'EngineRPM',
  width: 8,
  init_value: 0,
};

const baseFrame: LdfFrame = {
  name: 'EngineFrame',
  frame_id: 0x10,
  length: 4,
  signals: [],
};

describe('computeMaxInitValue', () => {
  it('width=1 → 1', () => {
    expect(computeMaxInitValue(1)).toBe(1);
  });
  it('width=8 → 255', () => {
    expect(computeMaxInitValue(8)).toBe(255);
  });
  it('width=16 → 65535', () => {
    expect(computeMaxInitValue(16)).toBe(65535);
  });
  it('width=64 不溢出 (2^64 - 1 在 IEEE 754 精度内是合法上界)', () => {
    // 后端用 Math.pow(2, 64) - 1;前端必须保持同样实现以避免边界值发散
    expect(computeMaxInitValue(64)).toBe(Math.pow(2, 64) - 1);
  });
});

describe('validateSignal', () => {
  it('合法信号返回 null', () => {
    expect(validateSignal(baseSignal)).toBeNull();
  });

  it('name 为空时报错', () => {
    expect(validateSignal({ ...baseSignal, name: '' })).toMatch(/name/i);
  });

  it('name 仅含空白时报错', () => {
    expect(validateSignal({ ...baseSignal, name: '  ' })).toMatch(/name/i);
  });

  it('width=0 越界', () => {
    expect(validateSignal({ ...baseSignal, width: 0 })).toMatch(/width/i);
  });

  it('width=65 越界', () => {
    expect(validateSignal({ ...baseSignal, width: 65 })).toMatch(/width/i);
  });

  it('width=1 合法', () => {
    expect(validateSignal({ ...baseSignal, width: 1, init_value: 1 })).toBeNull();
  });

  it('width=64 合法', () => {
    expect(validateSignal({ ...baseSignal, width: 64 })).toBeNull();
  });

  it('init_value 超出 width 容量', () => {
    expect(
      validateSignal({ ...baseSignal, width: 8, init_value: 256 })
    ).toMatch(/init_value/i);
  });

  it('init_value 负数', () => {
    expect(
      validateSignal({ ...baseSignal, width: 8, init_value: -1 })
    ).toMatch(/init_value/i);
  });

  it('init_value 等于上界合法', () => {
    expect(
      validateSignal({ ...baseSignal, width: 8, init_value: 255 })
    ).toBeNull();
  });

  it('width 非整数报错', () => {
    expect(validateSignal({ ...baseSignal, width: 1.5 })).toMatch(/width/i);
  });

  it('init_value 非整数报错', () => {
    expect(
      validateSignal({ ...baseSignal, init_value: 1.5 })
    ).toMatch(/init_value/i);
  });
});

describe('validateFrame', () => {
  it('合法帧返回 null', () => {
    expect(validateFrame(baseFrame)).toBeNull();
  });

  it('name 为空报错', () => {
    expect(validateFrame({ ...baseFrame, name: '' })).toMatch(/name/i);
  });

  it('frame_id=-1 越界', () => {
    expect(validateFrame({ ...baseFrame, frame_id: -1 })).toMatch(/frame_id/i);
  });

  it('frame_id=64 越界', () => {
    expect(validateFrame({ ...baseFrame, frame_id: 64 })).toMatch(/frame_id/i);
  });

  it('frame_id=0 合法', () => {
    expect(validateFrame({ ...baseFrame, frame_id: 0 })).toBeNull();
  });

  it('frame_id=63 合法', () => {
    expect(validateFrame({ ...baseFrame, frame_id: 63 })).toBeNull();
  });

  it('length=0 越界', () => {
    expect(validateFrame({ ...baseFrame, length: 0 })).toMatch(/length/i);
  });

  it('length=9 越界', () => {
    expect(validateFrame({ ...baseFrame, length: 9 })).toMatch(/length/i);
  });

  it('length=1 合法', () => {
    expect(validateFrame({ ...baseFrame, length: 1 })).toBeNull();
  });

  it('length=8 合法', () => {
    expect(validateFrame({ ...baseFrame, length: 8 })).toBeNull();
  });

  it('frame_id 非整数报错', () => {
    expect(validateFrame({ ...baseFrame, frame_id: 1.2 })).toMatch(/frame_id/i);
  });
});

describe('validateMapping', () => {
  it('信号刚好填满一字节', () => {
    expect(validateMapping(8, 0, 1)).toBeNull(); // width=8,offset=0,length=1B → 8bit
  });

  it('信号横跨字节合法', () => {
    expect(validateMapping(16, 0, 4)).toBeNull(); // 16bit @ 4B 帧
  });

  it('溢出帧容量', () => {
    expect(validateMapping(8, 1, 1)).toMatch(/exceed|capacity|frame/i);
  });

  it('offset 负数', () => {
    expect(validateMapping(8, -1, 4)).toMatch(/offset/i);
  });

  it('紧贴上界合法', () => {
    expect(validateMapping(1, 31, 4)).toBeNull(); // 4B = 32bit, 31+1 = 32 OK
  });

  it('刚好越过 1 bit 报错', () => {
    expect(validateMapping(2, 31, 4)).toMatch(/exceed|capacity|frame/i);
  });
});

describe('checkSignalOverlap', () => {
  const signals: LdfSignal[] = [
    { name: 'SigA', width: 8, init_value: 0 },
    { name: 'SigB', width: 8, init_value: 0 },
    { name: 'SigC', width: 3, init_value: 0 },
  ];

  function frameWith(mappings: Array<{ signal: string; offset: number }>): LdfFrame {
    return { ...baseFrame, signals: mappings };
  }

  it('无重叠返回 null', () => {
    const frame = frameWith([
      { signal: 'SigA', offset: 0 },
      { signal: 'SigB', offset: 8 },
    ]);
    expect(checkSignalOverlap(frame, signals)).toBeNull();
  });

  it('部分重叠返回错误', () => {
    const frame = frameWith([
      { signal: 'SigA', offset: 0 },
      { signal: 'SigB', offset: 4 },
    ]);
    expect(checkSignalOverlap(frame, signals)).toMatch(/overlap/i);
  });

  it('紧邻不重叠（end+1 == start）', () => {
    const frame = frameWith([
      { signal: 'SigC', offset: 0 }, // 0-2
      { signal: 'SigA', offset: 3 }, // 3-10
    ]);
    expect(checkSignalOverlap(frame, signals)).toBeNull();
  });

  it('找不到 signal 定义时按 width=1 处理', () => {
    const frame = frameWith([
      { signal: 'Unknown', offset: 0 },
      { signal: 'Unknown2', offset: 0 },
    ]);
    expect(checkSignalOverlap(frame, signals)).toMatch(/overlap/i);
  });
});
