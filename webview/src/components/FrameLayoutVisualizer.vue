<script setup lang="ts">
import { computed, ref } from 'vue';
import ByteRow from '@/components/ByteRow.vue';
import SignalBand from '@/components/SignalBand.vue';
import type { LdfFrame, LdfSignal } from '@/types/ldf';
import {
  computeSignalBands,
  getSignalColor,
  offsetFromDrag,
  splitBandIntoRows,
  validateDragOffset,
  type BandSegment,
} from '@/utils/bitLayout';

interface Props {
  frame: LdfFrame;
  signals: LdfSignal[];
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'updateOffset', signalName: string, offset: number): void;
  (e: 'selectSignal', signalName: string): void;
}>();

/** 拖拽状态 */
const draggingSignal = ref<string | null>(null);
const dragStartX = ref(0);
const dragCurrentX = ref(0);
const dragOriginalOffset = ref(0);
const dragCellWidth = ref(0);
const dragError = ref<string | null>(null);

const dragDx = computed(() => dragCurrentX.value - dragStartX.value);
const dragDeltaBits = computed(() =>
  offsetFromDrag(dragDx.value, dragCellWidth.value)
);
const dragCandidateOffset = computed(
  () => dragOriginalOffset.value + dragDeltaBits.value
);

const allBands = computed(() =>
  computeSignalBands(props.frame, props.signals)
);

const displayBands = computed(() => {
  if (!draggingSignal.value) {
    return allBands.value;
  }
  return allBands.value.map((band) => {
    if (band.signalName !== draggingSignal.value) {
      return band;
    }
    const offset = dragCandidateOffset.value;
    return {
      ...band,
      offset,
      startBit: offset,
      endBit: offset + band.width - 1,
    };
  });
});

const segmentsByRow = computed(() => {
  const map = new Map<number, BandSegment[]>();
  for (const band of displayBands.value) {
    for (const segment of splitBandIntoRows(band)) {
      const list = map.get(segment.byteRow) ?? [];
      list.push(segment);
      map.set(segment.byteRow, list);
    }
  }
  // 同一行内按起始列排序，保证渲染顺序稳定
  for (const list of map.values()) {
    list.sort((a, b) => a.startCol - b.startCol);
  }
  return map;
});

function rowSegments(byteRow: number): BandSegment[] {
  return segmentsByRow.value.get(byteRow) ?? [];
}

function startDrag(segment: BandSegment, event: PointerEvent) {
  const track = (event.target as HTMLElement | null)?.closest('.byte-track');
  if (!track) return;
  const rect = track.getBoundingClientRect();
  dragCellWidth.value = rect.width / 8;

  draggingSignal.value = segment.signalName;
  dragOriginalOffset.value = segment.offset;
  dragStartX.value = event.clientX;
  dragCurrentX.value = event.clientX;
  dragError.value = null;

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(event: PointerEvent) {
  dragCurrentX.value = event.clientX;
  if (!draggingSignal.value) return;
  const err = validateDragOffset(
    props.frame,
    props.signals,
    draggingSignal.value,
    dragCandidateOffset.value
  );
  dragError.value = err;
}

function onPointerUp() {
  if (!draggingSignal.value) return;
  if (!dragError.value) {
    emit('updateOffset', draggingSignal.value, dragCandidateOffset.value);
  }
  draggingSignal.value = null;
  dragError.value = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
}

function isInvalid(signalName: string): boolean {
  return draggingSignal.value === signalName && dragError.value !== null;
}

function bandTransform(signalName: string): string {
  return draggingSignal.value === signalName
    ? `translateX(${dragDx.value}px)`
    : '';
}

function selectSignal(signalName: string) {
  if (dragDeltaBits.value !== 0) return; // 拖拽结束后会触发 click，忽略
  emit('selectSignal', signalName);
}
</script>

<template>
  <div class="visualizer">
    <div class="grid">
      <ByteRow
        v-for="byteIndex in frame.length"
        :key="byteIndex"
        :byte-index="byteIndex - 1"
      >
        <SignalBand
          v-for="segment in rowSegments(byteIndex - 1)"
          :key="`${segment.signalName}-${segment.startBit}`"
          :signal-name="segment.signalName"
          :start-bit="segment.startBit"
          :end-bit="segment.endBit"
          :width="segment.width"
          :start-col="segment.startCol"
          :end-col="segment.endCol"
          :color="getSignalColor(segment.signalName)"
          :signal="segment.signal"
          :invalid="isInvalid(segment.signalName)"
          :style="{ transform: bandTransform(segment.signalName) }"
          @pointerdown="startDrag(segment, $event)"
          @click="selectSignal(segment.signalName)"
        />
      </ByteRow>
    </div>
    <div v-if="dragError" class="drag-error">{{ dragError }}</div>
    <div v-else-if="frame.signals.length === 0" class="empty">暂无信号映射</div>
  </div>
</template>

<style scoped>
.visualizer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}
.grid {
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vscode-editor-background, #1e1e1e);
}
.drag-error {
  font-size: 12px;
  color: #f48771;
  padding: 4px 0;
}
.empty {
  font-size: 12px;
  color: var(--vscode-disabledForeground, #808080);
  padding: 8px 0;
}
</style>
