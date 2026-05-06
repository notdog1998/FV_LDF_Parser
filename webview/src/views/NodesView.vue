/**
 * NodesView — 节点页(FR-02)
 *
 * 展示 master(主节点)和 slaves(从节点列表),含 product_id 与 NAD。
 */

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useLdfStore } from '@/stores/ldfStore';

const store = useLdfStore();
const { nodes } = storeToRefs(store);
</script>

<template>
  <div class="nodes">
    <h2>节点</h2>

    <section v-if="nodes?.master">
      <h3>主节点</h3>
      <div class="card">
        <div class="field">
          <span class="field__label">名称</span>
          <span class="field__value">{{ nodes.master.name }}</span>
        </div>
        <div class="field">
          <span class="field__label">时基(ms)</span>
          <span class="field__value">{{ nodes.master.timebase }}</span>
        </div>
        <div class="field">
          <span class="field__label">抖动(ms)</span>
          <span class="field__value">{{ nodes.master.jitter }}</span>
        </div>
      </div>
    </section>

    <section v-if="nodes?.slaves?.length">
      <h3>从节点</h3>
      <table class="table">
        <thead>
          <tr>
            <th>名称</th>
            <th>产品 ID</th>
            <th>已配置 NAD</th>
            <th>初始 NAD</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="slave in nodes.slaves" :key="slave.name">
            <td>{{ slave.name }}</td>
            <td>
              <span v-if="slave.product_id">
                {{
                  `0x${slave.product_id.supplier_id.toString(16).padStart(4, '0')}-0x${slave.product_id.function_id.toString(16).padStart(4, '0')}-0x${slave.product_id.variant.toString(16).padStart(2, '0')}`
                }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <span v-if="slave.configured_nad !== undefined">
                0x{{ slave.configured_nad.toString(16).padStart(2, '0').toUpperCase() }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <span v-if="slave.initial_nad !== undefined">
                0x{{ slave.initial_nad.toString(16).padStart(2, '0').toUpperCase() }}
              </span>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; }
h3 { font-size: 13px; margin: 16px 0 8px; font-weight: 600; color: var(--vscode-foreground, #ccc); }
.card {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  padding: 12px 16px;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-editor-background, #1e1e1e);
}
.field { display: contents; }
.field__label { color: var(--vscode-descriptionForeground, #808080); font-size: 12px; }
.field__value { font-size: 13px; font-weight: 500; font-family: var(--vscode-editor-font-family, 'Courier New', monospace); }
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
.muted { color: var(--vscode-disabledForeground, #808080); }
</style>
