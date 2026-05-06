/**
 * ChangeBadge — 行状态徽标(PR-03 / §9.4)
 *
 * 三色语义:
 * - created(绿): 用户在本会话中新增,尚未保存
 * - updated(黄): 已有对象被修改,尚未保存
 * - deleted(红): 已有对象被标记删除
 * - unchanged: 不渲染任何内容
 */

<script setup lang="ts">
import type { RowState } from '@/stores/ldfStore';

interface Props {
  state: RowState;
}
const { state } = defineProps<Props>();

const labelMap: Record<RowState, string> = {
  unchanged: '',
  created: '新建',
  updated: '修改',
  deleted: '删除',
};
const clsMap: Record<RowState, string> = {
  unchanged: '',
  created: 'badge--created',
  updated: 'badge--updated',
  deleted: 'badge--deleted',
};
</script>

<template>
  <span v-if="state !== 'unchanged'" :class="['badge', clsMap[state]]">
    {{ labelMap[state] }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  color: #fff;
}
.badge--created { background: #2ea043; }
.badge--updated { background: #d29922; }
.badge--deleted { background: #da3633; }
</style>
