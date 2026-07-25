<script setup lang="ts">
/**
 * ByteRow — CANoe 风格位图中的一行 Byte。
 *
 * 每行左侧显示 Byte 序号，右侧是 8 个等宽 bit cell（bit 7..0 从左到右）。
 * 条带通过默认 slot 注入到 .bands-layer，使用百分比定位覆盖 cell。
 */

interface Props {
  byteIndex: number;
}
const { byteIndex } = defineProps<Props>();

const bits = Array.from({ length: 8 }, (_, i) => byteIndex * 8 + (7 - i));
</script>

<template>
  <div class="byte-row">
    <div class="byte-label">Byte {{ byteIndex }}</div>
    <div class="byte-track">
      <div class="bit-cells">
        <div v-for="bit in bits" :key="bit" class="bit-cell">
          <span class="bit-index">{{ bit }}</span>
        </div>
      </div>
      <div class="bands-layer">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.byte-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: stretch;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.byte-row:last-child {
  border-bottom: none;
}
.byte-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground, #808080);
}
.byte-track {
  position: relative;
  min-height: 36px;
}
.bit-cells {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
}
.bit-cell {
  border-right: 1px solid var(--vscode-panel-border, #3c3c3c);
  background: var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.bit-cell:last-child {
  border-right: none;
}
.bit-index {
  font-size: 9px;
  color: var(--vscode-disabledForeground, #808080);
  margin-top: 2px;
}
.bands-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bands-layer > * {
  pointer-events: auto;
}
</style>
