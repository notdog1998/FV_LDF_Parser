# Vue 3 前端实现学习手册

> 目标：通过本项目的 `webview/` 子工程，系统学习 Vue 3 + Vite + Pinia + Vue Router，并能在读完后独立修改和扩展前端功能。

---

## 0. 前置准备（5 分钟）

### 0.1 需要的基础
- 会写 HTML/CSS/JavaScript（ES6+，即 `const/arrow function/解构`）
- 了解 TypeScript 基本类型标注（`interface`、`type`、`:` 类型注解）

### 0.2 环境确认
```bash
# 在项目根目录执行
cd webview
npm install          # 确保依赖已装
npm run dev          # 本地启动开发服务器（VS Code API 不可用，但 UI 可预览）
```
浏览器打开 `http://localhost:5173`，应能看到空白页（因为没有 Extension 发数据，属于正常）。

---

## 第一步：鸟瞰项目结构（10 分钟）

### 1.1 打开目录 `webview/src/`
```
src/
├── main.ts              ← 入口：创建 Vue 应用、注册插件
├── App.vue              ← 根组件：布局 + 全局状态监听
├── router/
│   └── index.ts         ← 路由表：4 个 Tab 对应 4 个视图
├── stores/
│   └── ldfStore.ts      ← Pinia Store：所有数据与业务逻辑
├── types/
│   └── ldf.ts           ← TypeScript 类型定义
├── api/
│   └── vscode.ts        ← VS Code WebView API 封装
├── utils/
│   └── validators.ts    ← 纯函数校验
├── components/          ← 可复用组件
│   ├── AppNav.vue
│   ├── StatusBar.vue
│   ├── ChangeBadge.vue
│   ├── ConfirmDialog.vue
│   ├── SignalForm.vue
│   ├── FrameForm.vue
│   └── SignalMappingEditor.vue
└── views/               ← 页面级组件（与路由一一对应）
    ├── OverviewView.vue
    ├── NodesView.vue
    ├── SignalsView.vue
    └── FramesView.vue
```

### 1.2 核心问题
问自己三个问题：
1. 数据从哪里来？→ Extension Host 通过 `postMessage` 发过来，经 `api/vscode.ts` 进入 Store
2. 数据怎么变？→ Store 的 Actions（`createSignal`/`updateSignal` 等）修改内存状态
3. 数据怎么显示？→ Vue 组件通过 `storeToRefs` 读取，模板自动响应更新

---

## 第二步：Vue 3 应用实例——从 `main.ts` 开始（15 分钟）

### 2.1 阅读文件
打开 `webview/src/main.ts`：

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

const app = createApp(App);    // ① 创建应用实例
app.use(createPinia());        // ② 注册 Pinia（状态管理插件）
app.use(router);               // ③ 注册 Vue Router（路由插件）
app.mount('#app');             // ④ 挂载到 DOM 的 <div id="app">
```

### 2.2 关键概念
| 代码 | 概念 | 作用 |
|------|------|------|
| `createApp` | Vue 3 应用实例 | 替代 Vue 2 的 `new Vue()`，支持多应用共存 |
| `app.use()` | 插件注册 | 给应用添加全局能力（Pinia、Router、第三方库） |
| `app.mount()` | DOM 挂载 | 把 Vue 组件树渲染到真实 DOM 节点上 |

### 2.3 动手任务
在 `main.ts` 末尾加一行：
```typescript
console.log('Vue app mounted, version:', app.version);
```
保存后看浏览器控制台，确认输出。

### 2.4 对应官方文档
- [Vue 3 应用实例](https://cn.vuejs.org/guide/essentials/application.html)

---

## 第三步：单文件组件（SFC）——以 `App.vue` 为例（20 分钟）

### 3.1 阅读文件
打开 `webview/src/App.vue`，观察三段式结构：

```vue
<script setup lang="ts">   ← 逻辑（JS/TS）
<template>                 ← 模板（HTML，带 Vue 指令）
<style>                    ← 样式（CSS）
```

### 3.2 `<script setup>` 语法要点
这是 Vue 3 的**组合式 API（Composition API）**写法，核心规则：

```vue
<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useLdfStore } from '@/stores/ldfStore';

const store = useLdfStore();          // 获取 Store 实例

onMounted(() => {                     // 生命周期钩子：组件挂载后执行
  store.bootstrap();                  // 向 Extension 发送 ready 消息
});

watch(() => store.status, (s) => {    // 监听状态变化
  if (s === 'error') console.error(store.errorMessage);
});
</script>
```

### 3.3 关键概念对照表
| 你看到的代码 | 它是什么 | 类比 |
|-------------|---------|------|
| `ref('idle')` | 响应式数据容器 | React 的 `useState`，但更轻 |
| `computed(() => ...)` | 计算属性 | Excel 公式，依赖变则自动重算 |
| `watch(() => x, callback)` | 监听器 | 订阅-发布模式 |
| `onMounted` | 生命周期钩子 | `window.onload` 的组件级版本 |
| `defineProps` / `defineEmits` | 组件通信声明 | 函数的参数和回调 |

### 3.4 动手任务
在 `App.vue` 的 `<template>` 中，给加载遮罩加一句自定义文字：
```vue
<div v-if="store.status === 'loading'" class="overlay overlay--loading">
  ⏳ 正在解析 LDF 文件，请稍候…（我是新手，我在学习 Vue！）
</div>
```
刷新浏览器，确认文字出现（可用浏览器 DevTools 手动把 `store.status` 改成 `'loading'` 来触发）。

### 3.5 对应官方文档
- [组合式 API：setup](https://cn.vuejs.org/api/composition-api-setup.html)
- [生命周期钩子](https://cn.vuejs.org/guide/essentials/lifecycle.html)

---

## 第四步：Pinia 状态管理——`ldfStore.ts`（30 分钟）

### 4.1 阅读文件
打开 `webview/src/stores/ldfStore.ts`，这是全项目最重要的文件。

### 4.2 核心模式：Setup Store
```typescript
export const useLdfStore = defineStore('ldf', () => {
  // === State ===
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const signals = ref<LdfSignal[]>([]);

  // === Getters ===
  const hasPendingChanges = computed(() =>
    pendingSignalChanges.value.length + pendingFrameChanges.value.length > 0
  );

  // === Actions ===
  function createSignal(data: LdfSignal): void {
    // 校验 + 更新 state + 记录 pending change
  }

  return { status, signals, hasPendingChanges, createSignal, ... };
});
```

### 4.3 为什么用 Pinia 而不是直接 `ref`？
- **跨组件共享**：任何组件 `useLdfStore()` 拿到的是同一个实例
- **Devtools 友好**：Vue Devtools 能追踪 State 变化和 Action 调用
- **可测试**：Store 是纯 JS 函数，脱离 Vue 也能单元测试

### 4.4 在组件中怎么用它？
```vue
<script setup>
import { useLdfStore } from '@/stores/ldfStore';
import { storeToRefs } from 'pinia';

const store = useLdfStore();
// storeToRefs 把 store 中的 ref 提取出来，保持响应式
const { signals, status, hasPendingChanges } = storeToRefs(store);

// 直接调用 action（不用 .value）
store.createSignal({ name: 'Test', width: 8, init_value: 0 });
</script>
```

**重要区别**：
- `storeToRefs(store)` 用于**模板绑定**（解构后仍保持响应式）
- `store.createSignal()` 直接调用 action

### 4.5 动手任务
在 `SignalsView.vue` 中，找到新建按钮的点击处理，加一行 `console.log`：
```typescript
function startCreate() {
  console.log('当前信号数量:', store.signals.length);
  editingName.value = null;
  isCreating.value = true;
}
```
在浏览器中点击「新建」按钮，观察控制台输出。

### 4.6 对应官方文档
- [Pinia 定义 Store](https://pinia.vuejs.org/zh/core-concepts/)
- [Pinia Setup Store](https://pinia.vuejs.org/zh/core-concepts/#setup-stores)

---

## 第五步：Vue Router——`router/index.ts`（15 分钟）

### 5.1 阅读文件
打开 `webview/src/router/index.ts`：

```typescript
import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', component: OverviewView, meta: { label: '概览' } },
  { path: '/nodes', component: NodesView, meta: { label: '节点' } },
  { path: '/signals', component: SignalsView, meta: { label: '信号' } },
  { path: '/frames', component: FramesView, meta: { label: '帧' } },
];

const router = createRouter({
  history: createWebHashHistory(),   // hash 模式：URL 变成 #/overview
  routes,
});
```

### 5.2 为什么用 hash 模式？
WebView 内页面通过 `file://` 或 `vscode-resource://` 加载，`history` 模式的 `pushState` 在这种环境下会异常。hash 模式只改 `#` 后面的内容，浏览器不会重新请求资源。

### 5.3 路由与组件的对应关系
```
URL             → 渲染的组件
#/overview      → OverviewView.vue（概览卡片）
#/nodes         → NodesView.vue（主/从节点列表）
#/signals       → SignalsView.vue（信号 CRUD 表格）
#/frames        → FramesView.vue（帧 CRUD 表格）
```

### 5.4 导航方式
- 声明式：`<RouterLink to="/signals">信号</RouterLink>`
- 编程式：`import { useRouter } from 'vue-router'; const router = useRouter(); router.push('/signals');`

### 5.5 动手任务
在 `AppNav.vue` 中，给「帧」Tab 后面加一个调试链接：
```vue
<li>
  <RouterLink :to="'/signals'" :class="['tab', { active: isActive('/signals') }]">
    去信号页（测试路由）
  </RouterLink>
</li>
```
点击它，观察 URL 和页面内容的变化。

### 5.6 对应官方文档
- [Vue Router 入门](https://router.vuejs.org/zh/guide/)

---

## 第六步：组件通信与表单（25 分钟）

### 6.1 Props 向下传——以 `SignalForm.vue` 为例

父组件（`SignalsView.vue`）传数据给子组件：
```vue
<SignalForm
  :initial-data="currentSignalForEdit"
  submit-label="保存"
  @submit="onSubmit"
  @cancel="cancelEdit"
/>
```

子组件（`SignalForm.vue`）接收：
```vue
<script setup lang="ts">
interface Props {
  initialData?: LdfSignal;
  submitLabel?: string;
}
const { initialData, submitLabel = '保存' } = defineProps<Props>();

const emit = defineEmits<{
  (e: 'submit', data: LdfSignal): void;
  (e: 'cancel'): void;
});
</script>
```

### 6.2 通信规则总结
| 方向 | 机制 | 代码 |
|------|------|------|
| 父 → 子 | Props | `defineProps<{ initialData: X }>()` |
| 子 → 父 | Emit | `defineEmits<{ (e: 'submit', data: X): void }>()` |
| 跨层级 | Store | `useLdfStore()`（任何层级都能用） |

### 6.3 表单的双向绑定 `v-model`
```vue
<input v-model="name" />
<!-- 等价于 -->
<input :value="name" @input="name = $event.target.value" />
```

`.number` 修饰符：`v-model.number="width"` 会自动把输入转成数字。

### 6.4 动手任务
给 `SignalForm.vue` 增加一个「复位」按钮，点击后把表单所有字段恢复成 `initialData`：

1. 在 `<template>` 的 actions 区域加按钮：
```vue
<button type="button" class="btn btn--secondary" @click="resetForm">复位</button>
```

2. 在 `<script setup>` 中实现：
```typescript
function resetForm() {
  if (initialData) {
    name.value = initialData.name;
    width.value = initialData.width;
    initValue.value = initialData.init_value;
    publisher.value = initialData.publisher ?? '';
    subscribers.value = initialData.subscribers?.join(', ') ?? '';
  }
}
```

保存后在浏览器测试编辑模式下点击「复位」。

### 6.5 对应官方文档
- [Props](https://cn.vuejs.org/guide/components/props.html)
- [事件](https://cn.vuejs.org/guide/components/events.html)
- [v-model](https://cn.vuejs.org/guide/components/v-model.html)

---

## 第七步：条件渲染与列表渲染——视图组件（20 分钟）

### 7.1 核心指令速查
打开任意 `views/*.vue`，你会看到这些指令：

| 指令 | 作用 | 本项目示例 |
|------|------|-----------|
| `v-if="condition"` | 条件渲染（真才渲染） | `v-if="store.status === 'loading'"` |
| `v-else` | v-if 的 else | 遮罩与内容互斥显示 |
| `v-for="item in list"` | 列表渲染 | `v-for="signal in store.signals"` |
| `:key="uniqueId"` | 列表唯一标识 | `:key="signal.name"` |
| `:class="{ active: bool }"` | 动态 class | 当前 Tab 高亮 |
| `@click="handler"` | 点击事件 | 按钮点击 |

### 7.2 为什么列表必须写 `:key`？
Vue 用 `key` 识别列表中的每个节点。如果不写，更新列表时 Vue 会按索引对比，可能导致状态错乱（比如编辑框内容串行）。

### 7.3 动手任务
在 `OverviewView.vue` 中，给字段列表加一个新字段「帧数量」，从 `store.frames.length` 读取：

1. 在 `fields` 数组中加一项：
```typescript
{ key: 'frameCount', label: '帧数量' },
```

2. 在 `value()` 函数中处理：
```typescript
if (key === 'frameCount') {
  return String(store.frames.length);
}
```

（注意：需要 `import { useLdfStore } from '@/stores/ldfStore'; const store = useLdfStore();`）

刷新浏览器，确认「帧数量」显示为 `0`（因为没有 Extension 发数据）。

### 7.4 对应官方文档
- [条件渲染](https://cn.vuejs.org/guide/essentials/conditional.html)
- [列表渲染](https://cn.vuejs.org/guide/essentials/list.html)
- [Class 与 Style 绑定](https://cn.vuejs.org/guide/essentials/class-and-style.html)

---

## 第八步：测试——怎么验证你改对了（20 分钟）

### 8.1 本项目有两套测试

**单元测试（纯 JS/TS）**：
```bash
cd webview
npm test -- tests/validators.test.ts   # 只跑校验测试
npm test -- tests/ldfStore.test.ts     # 只跑 Store 测试
```

**组件测试（需要 DOM）**：
```bash
npm test -- tests/ChangeBadge.test.ts  # 组件渲染测试
```

### 8.2 测试文件结构拆解
以 `tests/ldfStore.test.ts` 为例：

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ldfStore — 信号 CRUD', () => {
  it('createSignal 追加 pending change(create)', () => {
    const store = loadedStore();
    store.createSignal({ name: 'NewSig', width: 4, init_value: 1 });
    expect(store.pendingSignalChanges).toHaveLength(1);
    expect(store.pendingSignalChanges[0]._action).toBe('create');
  });
});
```

| 函数 | 作用 |
|------|------|
| `describe` | 分组（好比一个章节标题） |
| `it` | 单个测试用例（好比一道题） |
| `expect(x).toBe(y)` | 断言：x 必须等于 y |
| `expect(x).toThrow()` | 断言：x 执行时必须抛错 |
| `vi.fn()` | 创建 mock 函数，用来假造 `postMessage` |

### 8.3 动手任务
给 `validators.test.ts` 增加一个测试：宽度为 `32` 时，最大初始值应该是 `4294967295`。

```typescript
it('width=32 → 4294967295', () => {
  expect(computeMaxInitValue(32)).toBe(4294967295);
});
```

运行 `npm test`，确认新测试通过。

### 8.4 对应官方文档
- [Vitest 入门](https://vitest.dev/guide/)
- [@vue/test-utils](https://test-utils.vuejs.org/guide/)

---

## 第九步：端到端修改——做一个完整的功能迭代（30 分钟）

### 任务：给「信号」表格增加「Publisher」列的筛选框

**Step 1：Store 层**  
在 `ldfStore.ts` 中新增一个 getter：
```typescript
const uniquePublishers = computed(() => {
  const set = new Set<string>();
  for (const s of signals.value) {
    if (s.publisher) set.add(s.publisher);
  }
  return Array.from(set).sort();
});

return { ...uniquePublishers };
```

**Step 2：视图层**  
在 `SignalsView.vue` 顶部加一个 `<select>` 筛选框：
```vue
<select v-model="publisherFilter">
  <option value="">全部 Publisher</option>
  <option v-for="p in store.uniquePublishers" :key="p" :value="p">{{ p }}</option>
</select>
```

表格用计算属性过滤：
```typescript
const filteredSignals = computed(() => {
  if (!publisherFilter.value) return store.signals;
  return store.signals.filter(s => s.publisher === publisherFilter.value);
});
```

把 `v-for="signal in store.signals"` 改成 `v-for="signal in filteredSignals"`。

**Step 3：验证**  
1. `npm test` — 确认没有破坏现有测试
2. `npx vue-tsc --noEmit` — 确认没有类型错误
3. `npm run dev` — 浏览器中确认筛选功能正常

---

## 附录：常见问题速查

### Q1：改完代码浏览器没变化？
- 检查终端是否还在跑 `npm run dev`
- 强制刷新浏览器（Ctrl+Shift+R）
- 检查浏览器控制台是否有红色报错

### Q2：`useLdfStore()` 在组件里报错？
- 确认组件在 `<script setup>` 中调用
- 确认 `main.ts` 里 `app.use(createPinia())` 已执行
- 确认没有在 `setup` 外部（如普通函数里）调用

### Q3：TypeScript 报错 `Property 'xxx' does not exist`？
- 检查 `tsconfig.json` 的 `paths` 配置：`"@/*": ["src/*"]`
- 检查 import 路径是否写错
- 运行 `npx vue-tsc --noEmit` 定位具体错误

### Q4：如何调试 Vue 组件？
1. 安装浏览器插件 **Vue.js devtools**
2. 打开 DevTools → Vue 面板
3. 选中组件 → 右侧可实时查看 `props/data/computed`
4. 点击 `Pinia` 标签可追踪 Store 状态变化

---

## 推荐阅读顺序

1. [Vue 3 官方文档——快速上手](https://cn.vuejs.org/guide/quick-start.html)（先通读，不求记住）
2. [Pinia 文档——核心概念](https://pinia.vuejs.org/zh/core-concepts/)
3. [Vue Router 文档——入门](https://router.vuejs.org/zh/guide/)
4. 回到本项目，按本手册第 1~8 步逐文件对照
5. 尝试完成「第九步」的动手任务

---

## 下一步可以做什么？

- **美化 UI**：引入 [VS Code Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit) 替换手写样式
- **增加搜索**：给 SignalsView/FramesView 加顶部搜索框，按名称过滤
- **拖拽排序**：用 `@vueuse/gesture` 或原生 HTML5 Drag API 实现帧内信号映射的拖拽重排
- **图表可视化**：用 ECharts 在 OverviewView 中画波特率/信号位宽分布图
