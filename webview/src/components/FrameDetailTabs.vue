<script setup lang="ts">
/**
 * FrameDetailTabs — frame 展开行内的列表/布局切换容器。
 *
 * - 「列表」标签保留 SignalMappingEditor，用于精确增删改 signal offset。
 * - 「布局」标签展示 CANoe 风格的 Byte 行位图，支持拖拽调整 offset。
 */

import { ref } from 'vue';
import FrameLayoutVisualizer from '@/components/FrameLayoutVisualizer.vue';
import SignalMappingEditor from '@/components/SignalMappingEditor.vue';
import type { LdfFrame, LdfSignal } from '@/types/ldf';

interface Props {
  frame: LdfFrame;
  signals: LdfSignal[];
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'addMapping', signalName: string, offset: number): void;
  (e: 'removeMapping', signalName: string): void;
  (e: 'updateOffset', signalName: string, offset: number): void;
}>();

const activeTab = ref<'list' | 'layout'>('layout');

function onSelectSignal(signalName: string) {
  activeTab.value = 'list';
  // TODO: 高亮 SignalMappingEditor 中对应行（如需可在后续迭代增强）
  void signalName;
}
</script>

<template>
  <div class="frame-detail">
    <div class="tabs">
      <button
        class="tab"
        :class="{ 'tab--active': activeTab === 'list' }"
        @click="activeTab = 'list'"
      >
        列表
      </button>
      <button
        class="tab"
        :class="{ 'tab--active': activeTab === 'layout' }"
        @click="activeTab = 'layout'"
      >
        布局
      </button>
    </div>

    <div v-show="activeTab === 'list'" class="tab-panel">
      <SignalMappingEditor
        :frame="frame"
        :signals="signals"
        @add-mapping="(s, o) => emit('addMapping', s, o)"
        @remove-mapping="(s) => emit('removeMapping', s)"
        @update-offset="(s, o) => emit('updateOffset', s, o)"
      />
    </div>

    <div v-show="activeTab === 'layout'" class="tab-panel">
      <FrameLayoutVisualizer
        :frame="frame"
        :signals="signals"
        @update-offset="(s, o) => emit('updateOffset', s, o)"
        @select-signal="onSelectSignal"
      />
    </div>
  </div>
</template>

<style scoped>
.frame-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--vscode-foreground, #cccccc);
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  margin-bottom: -1px;
}
.tab:hover {
  background: var(--vscode-toolbar-hoverBackground, #2a2d2e);
}
.tab--active {
  border-bottom-color: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
  font-weight: 600;
}
.tab-panel {
  padding-top: 4px;
}
</style>
