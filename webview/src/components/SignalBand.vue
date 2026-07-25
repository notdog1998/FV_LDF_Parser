<script setup lang="ts">
import { ref } from 'vue';
import type { LdfSignal } from '@/types/ldf';
import type { SignalColor } from '@/utils/bitLayout';

interface Props {
  signalName: string;
  startBit: number;
  endBit: number;
  width: number;
  startCol: number;
  endCol: number;
  color: SignalColor;
  signal?: LdfSignal;
  invalid?: boolean;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'pointerdown', event: PointerEvent): void;
  (e: 'click'): void;
}>();

const showTooltip = ref(false);

const visualLeft = Math.min(props.startCol, props.endCol);
const visualWidth = Math.abs(props.endCol - props.startCol) + 1;
const leftPercent = visualLeft * 12.5;
const widthPercent = visualWidth * 12.5;

function onPointerDown(event: PointerEvent) {
  event.preventDefault();
  emit('pointerdown', event);
}

function publisherText(): string {
  return props.signal?.publisher ?? '—';
}

function subscribersText(): string {
  const list = props.signal?.subscribers;
  if (!list || list.length === 0) return '—';
  return list.join(', ');
}

function tooltipText(): string {
  return [
    `Signal: ${props.signalName}`,
    `Width: ${props.width} bit`,
    `Offset: ${props.startBit}`,
    `Bits: ${props.startBit}–${props.endBit}`,
    `Publisher: ${publisherText()}`,
    `Subscribers: ${subscribersText()}`,
    `Init: ${props.signal?.init_value ?? '—'}`,
  ].join('\n');
}
</script>

<template>
  <div
    class="band"
    :class="{ 'band--invalid': invalid }"
    :style="{
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
      backgroundColor: color.background,
      borderColor: color.border,
      color: color.foreground,
    }"
    @pointerdown="onPointerDown"
    @click="emit('click')"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <span class="band__label">{{ signalName }}</span>
    <span class="band__bits">{{ startBit }}–{{ endBit }}</span>
    <div v-if="showTooltip" class="tooltip">
      <div class="tooltip__title">{{ signalName }}</div>
      <div class="tooltip__row">Width: {{ width }} bit | Offset: {{ startBit }}</div>
      <div class="tooltip__row">Bits: {{ startBit }}–{{ endBit }}</div>
      <div class="tooltip__row">Publisher: {{ publisherText() }}</div>
      <div class="tooltip__row">Subscribers: {{ subscribersText() }}</div>
      <div class="tooltip__row">Init: {{ signal?.init_value ?? '—' }}</div>
    </div>
  </div>
</template>

<style scoped>
.band {
  position: absolute;
  top: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  border: 1px solid;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  cursor: grab;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  transition: transform 0.05s ease, box-shadow 0.05s ease;
}
.band:active {
  cursor: grabbing;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}
.band--invalid {
  background-color: #f48771 !important;
  border-color: #c53b1b !important;
  color: #fff !important;
}
.band__label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.band__bits {
  opacity: 0.85;
  font-size: 9px;
  font-weight: 500;
  margin-left: 4px;
  flex-shrink: 0;
}
.tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  z-index: 20;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--vscode-editorHoverWidget-background, #252526);
  color: var(--vscode-editorHoverWidget-foreground, #cccccc);
  border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  pointer-events: none;
}
.tooltip__title {
  font-weight: 700;
  margin-bottom: 2px;
}
.tooltip__row {
  color: var(--vscode-descriptionForeground, #bbbbbb);
}
/* 窄条带隐藏位范围，避免拥挤 */
@media (max-width: 600px) {
  .band__bits {
    display: none;
  }
}
</style>
