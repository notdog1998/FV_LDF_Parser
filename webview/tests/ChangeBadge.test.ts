/**
 * ChangeBadge 组件测试 — PRD §9.4 / §9.7
 *
 * 验证四种 rowState 下的渲染行为: unchanged 不渲染,created/updated/deleted 分别输出正确文本与 class。
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ChangeBadge from '@/components/ChangeBadge.vue';
import type { RowState } from '@/stores/ldfStore';

describe('ChangeBadge', () => {
  it('unchanged 时不渲染', () => {
    const wrapper = mount(ChangeBadge, { props: { state: 'unchanged' } });
    expect(wrapper.find('span').exists()).toBe(false);
  });

  it.each<[RowState, string, string]>([
    ['created', '新建', 'badge--created'],
    ['updated', '修改', 'badge--updated'],
    ['deleted', '删除', 'badge--deleted'],
  ])('state=%s 渲染文本 "%s" 与 class %s', (state, text, cls) => {
    const wrapper = mount(ChangeBadge, { props: { state } });
    const span = wrapper.find('span');
    expect(span.exists()).toBe(true);
    expect(span.text()).toBe(text);
    expect(span.classes()).toContain(cls);
  });
});
