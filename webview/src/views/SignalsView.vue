/**
 * SignalsView — 信号 CRUD 视图(FR-03)
 *
 * 表格展示 signals 数组,每行通过 signalRowState 判断状态:
 * - deleted: 整行置灰,显示「撤销删除」
 * - created/updated: 显示 ChangeBadge
 *
 * 新建/编辑通过 SignalForm 弹窗内联处理;弹窗仅改变本地数据,不直接发 Extension 消息,
 * 直到用户点击全局「保存」才统一提交。
 */

<script setup lang="ts">
import { ref } from 'vue';
import { useLdfStore } from '@/stores/ldfStore';
import ChangeBadge from '@/components/ChangeBadge.vue';
import SignalForm from '@/components/SignalForm.vue';
import type { LdfSignal } from '@/types/ldf';

const store = useLdfStore();

// 当前内联编辑或新建的信号 name
const editingName = ref<string | null>(null);
const isCreating = ref(false);

function startCreate() {
  editingName.value = null;
  isCreating.value = true;
}

function startEdit(name: string) {
  editingName.value = name;
  isCreating.value = false;
}

function cancelEdit() {
  editingName.value = null;
  isCreating.value = false;
}

function onSubmit(data: LdfSignal) {
  try {
    if (isCreating.value) {
      store.createSignal(data);
    } else {
      store.updateSignal(editingName.value!, data);
    }
    cancelEdit();
  } catch (e) {
    // 校验失败会抛 Error,但 SignalForm 已经做了前端校验,这里只是兜底;
    // 把异常打到控制台,不阻断用户
    console.error(e);
  }
}

function onDelete(name: string) {
  store.markSignalDeleted(name);
}

function onRestore(name: string) {
  store.cancelSignalDelete(name);
}

function rowClass(name: string): string {
  const state = store.signalRowState(name);
  return state === 'deleted' ? 'row--deleted' : '';
}

const currentSignalForEdit = ref<LdfSignal | undefined>(undefined);
function prepareEdit(name: string) {
  const signal = store.signals.find((s) => s.name === name);
  currentSignalForEdit.value = signal ? { ...signal } : undefined;
  startEdit(name);
}
</script>

<template>
  <div class="signals">
    <div class="toolbar">
      <h2>信号</h2>
      <button class="btn btn--primary" @click="startCreate">➕ 新建</button>
    </div>

    <!-- 新建表单 -->
    <div v-if="isCreating" class="panel">
      <SignalForm
        submit-label="创建"
        @submit="onSubmit"
        @cancel="cancelEdit"
      />
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>状态</th>
          <th>名称</th>
          <th>位宽</th>
          <th>初始值</th>
          <th>发布者</th>
          <th>订阅者</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="signal in store.signals"
          :key="signal.name"
          :class="['row', rowClass(signal.name)]"
        >
          <!-- 如果当前行在内联编辑中,整行换成表单 -->
          <template v-if="editingName === signal.name">
            <td colspan="7" class="cell--editor">
              <SignalForm
                :initial-data="currentSignalForEdit"
                @submit="onSubmit"
                @cancel="cancelEdit"
              />
            </td>
          </template>

          <template v-else>
            <td>
              <ChangeBadge :state="store.signalRowState(signal.name)" />
            </td>
            <td>{{ signal.name }}</td>
            <td>{{ signal.width }}</td>
            <td>{{ signal.init_value }}</td>
            <td>{{ signal.publisher || '—' }}</td>
            <td>{{ signal.subscribers?.join(', ') || '—' }}</td>
            <td class="actions">
              <template v-if="store.signalRowState(signal.name) === 'deleted'">
                <button class="btn btn--text" @click="onRestore(signal.name)">撤销</button>
              </template>
              <template v-else>
                <button class="btn btn--text" @click="prepareEdit(signal.name)">编辑</button>
                <button class="btn btn--text btn--danger" @click="onDelete(signal.name)">删除</button>
              </template>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.signals { display: flex; flex-direction: column; gap: 8px; }
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
.cell--editor {
  padding: 10px 14px;
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
