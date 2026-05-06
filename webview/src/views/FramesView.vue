/**
 * FramesView — 帧 CRUD 视图(FR-04)
 *
 * 类似 SignalsView,但增加了:
 * - 行展开/收起:展开后显示 SignalMappingEditor 管理该帧的信号映射
 * - 帧字段展示:名称、帧 ID、长度、发布者
 */

<script setup lang="ts">
import { ref } from 'vue';
import { useLdfStore } from '@/stores/ldfStore';
import ChangeBadge from '@/components/ChangeBadge.vue';
import FrameForm from '@/components/FrameForm.vue';
import SignalMappingEditor from '@/components/SignalMappingEditor.vue';
import type { LdfFrame } from '@/types/ldf';

const store = useLdfStore();

const editingName = ref<string | null>(null);
const isCreating = ref(false);
const expandedFrame = ref<string | null>(null);

function startCreate() {
  editingName.value = null;
  isCreating.value = true;
  expandedFrame.value = null;
}

function startEdit(name: string) {
  editingName.value = name;
  isCreating.value = false;
  expandedFrame.value = null;
}

function cancelEdit() {
  editingName.value = null;
  isCreating.value = false;
}

function onSubmit(data: LdfFrame) {
  try {
    if (isCreating.value) {
      store.createFrame(data);
    } else {
      store.updateFrame(editingName.value!, data);
    }
    cancelEdit();
  } catch (e) {
    console.error(e);
  }
}

function onDelete(name: string) {
  store.markFrameDeleted(name);
}

function onRestore(name: string) {
  store.cancelFrameDelete(name);
}

function toggleExpand(name: string) {
  expandedFrame.value = expandedFrame.value === name ? null : name;
}

function rowClass(name: string): string {
  return store.frameRowState(name) === 'deleted' ? 'row--deleted' : '';
}

function onAddMapping(frameName: string, signalName: string, offset: number) {
  store.addSignalMapping(frameName, signalName, offset);
}
function onRemoveMapping(frameName: string, signalName: string) {
  store.removeSignalMapping(frameName, signalName);
}
function onUpdateOffset(frameName: string, signalName: string, offset: number) {
  store.updateSignalOffset(frameName, signalName, offset);
}
</script>

<template>
  <div class="frames">
    <div class="toolbar">
      <h2>帧</h2>
      <button class="btn btn--primary" @click="startCreate">➕ 新建</button>
    </div>

    <div v-if="isCreating" class="panel">
      <FrameForm submit-label="创建" @submit="onSubmit" @cancel="cancelEdit" />
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>状态</th>
          <th>名称</th>
          <th>帧 ID</th>
          <th>长度</th>
          <th>发布者</th>
          <th>映射数</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="frame in store.frames" :key="frame.name">
          <tr :class="['row', rowClass(frame.name)]">
            <template v-if="editingName === frame.name">
              <td colspan="7" class="cell--editor">
                <FrameForm
                  :initial-data="{ ...frame }"
                  @submit="onSubmit"
                  @cancel="cancelEdit"
                />
              </td>
            </template>
            <template v-else>
              <td><ChangeBadge :state="store.frameRowState(frame.name)" /></td>
              <td>{{ frame.name }}</td>
              <td>0x{{ frame.frame_id.toString(16).toUpperCase().padStart(2, '0') }}</td>
              <td>{{ frame.length }}</td>
              <td>{{ frame.publisher || '—' }}</td>
              <td>{{ frame.signals.length }}</td>
              <td class="actions">
                <template v-if="store.frameRowState(frame.name) === 'deleted'">
                  <button class="btn btn--text" @click="onRestore(frame.name)">撤销</button>
                </template>
                <template v-else>
                  <button class="btn btn--text" @click="startEdit(frame.name)">编辑</button>
                  <button class="btn btn--text btn--danger" @click="onDelete(frame.name)">删除</button>
                  <button class="btn btn--text" @click="toggleExpand(frame.name)">
                    {{ expandedFrame === frame.name ? '收起' : '映射' }}
                  </button>
                </template>
              </td>
            </template>
          </tr>

          <!-- 展开行:信号映射编辑器 -->
          <tr v-if="expandedFrame === frame.name" class="row--expand">
            <td colspan="7" class="cell--expand">
              <SignalMappingEditor
                :frame="frame"
                :signals="store.signals"
                @add-mapping="(s, o) => onAddMapping(frame.name, s, o)"
                @remove-mapping="(s) => onRemoveMapping(frame.name, s)"
                @update-offset="(s, o) => onUpdateOffset(frame.name, s, o)"
              />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.frames { display: flex; flex-direction: column; gap: 8px; }
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 { font-size: 16px; margin: 0; font-weight: 600; }
.panel {
  padding: 10px 14px;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-editor-background, #1e1e1e);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table th, .table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.table th {
  color: var(--vscode-descriptionForeground, #808080);
  font-weight: 600;
}
.row--deleted td {
  opacity: 0.45;
  text-decoration: line-through;
}
.row--expand td {
  border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
}
.cell--editor {
  padding: 10px 14px;
  background: var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
}
.cell--expand {
  padding: 8px 16px;
  background: var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
}
.actions { display: flex; gap: 6px; }
.btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  background: var(--vscode-button-secondaryBackground, #3c3c3c);
  color: var(--vscode-button-secondaryForeground, #ccc);
}
.btn--primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
}
.btn--text {
  background: transparent;
  color: var(--vscode-textLink-foreground, #3794ff);
  padding: 2px 4px;
}
.btn--danger { color: #f48771; }
.btn:hover { filter: brightness(1.15); }
</style>