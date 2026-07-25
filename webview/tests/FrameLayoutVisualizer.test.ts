/**
 * FrameLayoutVisualizer 组件测试
 *
 * 验证 Byte 行、signal 条带、空状态等基本渲染行为。
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FrameLayoutVisualizer from '@/components/FrameLayoutVisualizer.vue';
import type { LdfFrame, LdfSignal } from '@/types/ldf';

const signals: LdfSignal[] = [
  { name: 'SigA', width: 8, init_value: 0 },
  { name: 'SigB', width: 8, init_value: 0 },
];

const frame: LdfFrame = {
  name: 'TestFrame',
  frame_id: 0x10,
  length: 2,
  signals: [
    { signal: 'SigA', offset: 0 },
    { signal: 'SigB', offset: 8 },
  ],
};

describe('FrameLayoutVisualizer', () => {
  it('渲染所有 Byte 行', () => {
    const wrapper = mount(FrameLayoutVisualizer, {
      props: { frame, signals },
    });
    expect(wrapper.findAll('.byte-row').length).toBe(2);
  });

  it('渲染每个 signal 的条带', () => {
    const wrapper = mount(FrameLayoutVisualizer, {
      props: { frame, signals },
    });
    const bands = wrapper.findAll('.band');
    expect(bands.length).toBe(2);
    expect(bands[0].text()).toContain('SigA');
    expect(bands[1].text()).toContain('SigB');
  });

  it('跨 Byte 的 signal 拆分成多个条带片段', () => {
    const wideSignal: LdfSignal = { name: 'Wide', width: 16, init_value: 0 };
    const f: LdfFrame = {
      ...frame,
      signals: [{ signal: 'Wide', offset: 0 }],
    };
    const wrapper = mount(FrameLayoutVisualizer, {
      props: { frame: f, signals: [wideSignal] },
    });
    // 16 bit 占满两个 Byte，应渲染两个条带片段
    expect(wrapper.findAll('.band').length).toBe(2);
  });

  it('无映射时显示空提示', () => {
    const emptyFrame = { ...frame, signals: [] };
    const wrapper = mount(FrameLayoutVisualizer, {
      props: { frame: emptyFrame, signals },
    });
    expect(wrapper.find('.empty').exists()).toBe(true);
  });
});
