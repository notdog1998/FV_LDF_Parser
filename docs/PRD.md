# LDF Explorer - PRD

## 1. 概述

VS Code 插件 + CLI 工具，用于可视化浏览和编辑 LIN Description File (LDF)。通过 WebView 提供图形化界面，支持对信号和报文的增删改查。前后端分离，业务逻辑下沉到服务层，CLI 与 Extension 共享同一服务层。

## 2. 目标

- **业务**: 为嵌入式工程师提供直观的 LDF 可视化编辑工具，同时提供命令行操作能力。
- **学习**: 借本项目系统学习 Vue 3 生态（Composition API、SFC、Vite、Vue Router、Pinia）。前端代码需体现这些技术点，结构清晰，注释完整。

## 3. 功能需求

### FR-01 文件打开与解析
- 右键 `.ldf` 文件或命令面板选择 "Open in LDF Explorer" 打开 WebView Panel。
- Extension 调用 Service Layer 解析文件，JSON 结果传给 WebView。失败时显示错误和堆栈。
- 支持同时打开多个文件，同一文件不重复创建 Panel。

### FR-02 数据展示
- **概览**: 协议版本、语言版本、波特率、校验模型、通道名称。
- **节点**: 主节点（名称、响应超时）、从节点列表（含产品 ID）。
- **信号**: 列表展示名称、位宽、初始值。
- **报文帧**: 列表展示名称、帧 ID、长度、发布者及内部信号映射。

### FR-03 信号增删改查
- **创建**: 输入名称、位宽(1-64)、初始值、发布者、订阅者。
- **更新**: 编辑现有信号属性。
- **删除**: 标记删除，保存前可取消。
- **状态可视化**: 新建(绿)、修改(黄)、删除(红/置灰)。

### FR-04 报文帧增删改查
- **创建/更新/删除**: 同信号逻辑。
- **信号映射**: 帧内添加/删除/修改信号映射（信号名 + bit 偏移量）。
- 帧 ID 范围 0-63，长度 1-8 byte。

### FR-05 保存与刷新
- **保存**: 将 signals 和 frames 的变更列表发送给 Extension，由 Extension 调用 Service Layer 写回文件。成功则刷新，失败则提示错误。
- **刷新**: 放弃未保存变更，重新解析文件。需二次确认。

### FR-06 CLI 工具
- `ldf-explorer parse <file.ldf>` — 解析文件并输出 JSON 到 stdout。
- `ldf-explorer info <file.ldf>` — 输出文件基本信息（表格或 JSON）。
- `ldf-explorer signals <file.ldf>` — 列出所有信号。
- `ldf-explorer frames <file.ldf>` — 列出所有帧及信号映射。
- `ldf-explorer validate <file.ldf>` — 验证文件格式是否正确。
- CLI 直接 import Service Layer 模块调用，不经过 HTTP。

### FR-07 前端实现（Vue 3 SPA）
- 在 `webview/` 子工程下用 Vue 3 + Vite + Vue Router + Pinia + TypeScript 构建单页应用，构建产物输出到 `dist/webview/`。
- 启动后立刻向 Extension 发送 `ready`，根据后续消息切换 loading / 数据 / 错误三种顶层状态。
- 顶部导航 Tab 提供四个视图：概览、节点、信号、帧；右上角放“保存”“刷新”两个全局动作按钮。
- 信号、帧编辑遵循 FR-03/FR-04：在内存里维护 `pendingSignalChanges` 与 `pendingFrameChanges`，状态可视化（绿/黄/红）必须体现，删除可在保存前撤销。
- 刷新按钮触发二次确认弹窗（FR-05）；当存在未保存变更时，按钮额外强调“将丢弃未保存改动”。
- 保存动作把两个 pending 列表打包成 `saveChanges` 消息发给 Extension；保存成功后用最新 payload 重置内存状态。
- 任何来自 Extension 的 `error` / `saveError` 消息都要在底部状态条显式展示，不能静默吞掉。

## 4. 技术架构

```
┌─────────────┐     postMessage      ┌─────────────────────────────────┐
│  WebView    │ ◄──────────────────► │      Extension Host             │
│ (Vue 3 SPA) │                      │  (代理: postMessage ↔ 服务层)    │
└─────────────┘                      └────────────────┬────────────────┘
                                                      │  import
                         ┌────────────────────────────┼────────────────────────────┐
                         │                            │                            │
                         ▼                            ▼                            ▼
                ┌─────────────────┐           ┌─────────────┐             ┌─────────────┐
                │  Service Layer  │           │     CLI     │             │   Python    │
                │  (Node.js 模块) │           │  (Node.js)  │             │ (ldfparser) │
                │  纯业务逻辑封装  │           │ 直接 import │             └──────┬──────┘
                └────────┬────────┘           └─────────────┘                    │
                         └────────────────────────── spawn ──────────────────────┘
```

- **WebView**: Vue 3 (Composition API + `<script setup>`) + Vue Router + Pinia，Vite 构建为静态文件。
- **Extension Host**: TypeScript，负责命令注册、WebView 管理。作为 WebView 与 Service Layer 之间的代理（透传消息）。
- **Service Layer**: Node.js 模块，封装所有 LDF 业务逻辑。Extension 和 CLI 直接 `import` 调用。
- **CLI**: 独立 Node.js 命令行工具，直接 import Service Layer 模块。支持 `--json` 输出 JSON 格式。
- **Python**: 保留 `python/ldfparser/`（禁止修改）和 `python/parse_ldf.py`（桥接脚本），由 Service Layer 内部 spawn 调用。

### 前后端分离的意义
- Service Layer 可独立运行和测试，不依赖 VS Code。
- CLI 与 Extension 共享同一套业务逻辑。
- WebView 仅负责 UI 渲染，不感知 Python 细节。

## 5. 通信协议

### WebView ↔ Extension Host
- **WebView → Extension**: `{ type: 'ready' | 'requestRefresh' | 'saveChanges', payload?: ... }`
- **Extension → WebView**: `{ type: 'loading' | 'ok' | 'error' | 'saveError', payload?: ... }`

Extension 不做业务逻辑，收到消息后直接调用 Service Layer 方法，再将结果转发给 WebView。

### Service Layer ↔ Python
Service Layer 通过 spawn 调用 `python/parse_ldf.py`，stdin JSON → stdout JSON：
- 解析: `{ "command": "parse", "args": { "path": "..." } }`
- 保存: `{ "command": "save", "args": { "path": "...", "data": { "signals": [...], "frames": [...] } } }`

## 6. 核心数据类型

```typescript
interface LdfSignal {
  name: string;
  width: number;             // 1–64
  init_value: number;
  publisher?: string;
  subscribers?: string[];
}

interface LdfFrame {
  name: string;
  frame_id: number;          // 0–63
  length: number;            // 1–8 bytes
  publisher?: string;
  signals: Array<{ signal: string; offset: number }>;
}

interface LdfOverview {
  protocol_version: string;
  language_version: string;
  baudrate: number;
  channel?: string;
  checksum_model?: 'classic' | 'enhanced';   // 由协议版本派生
}

interface LdfProductId {
  supplier_id: number;
  function_id: number;
  variant: number;
}

interface LdfMaster {
  name: string;
  timebase: number;
  jitter: number;
}

interface LdfSlave {
  name: string;
  product_id?: LdfProductId;
  configured_nad?: number;
  initial_nad?: number;
}

interface LdfNodes {
  master?: LdfMaster;
  slaves: LdfSlave[];
}

/** Extension 在 ok 消息里返回的完整 payload，前端 store 一次性吸收。 */
interface LdfPayload {
  overview: LdfOverview;
  nodes: LdfNodes;
  signals: LdfSignal[];
  frames: LdfFrame[];
}

interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;              // 前端为未持久化的新建项分配的临时 ID
  _editing?: boolean;        // 行内编辑标记（仅 UI）
  data: T;
}
```

## 7. 目录结构

```
vscode-ldf-explorer/
├── docs/PRD.md
├── python/
│   ├── ldfparser/                    # [保留] 解析库
│   └── parse_ldf.py                  # [保留] 桥接脚本
├── src/
│   ├── extension.ts                  # Extension 入口（postMessage 代理）
│   ├── service/
│   │   ├── ldfService.ts             # 聚合 Signal/Frame Service + overview/nodes
│   │   ├── signalService.ts
│   │   ├── frameService.ts
│   │   ├── pythonBridge.ts
│   │   └── types.ts                  # 共享领域类型，前后端共用
│   └── cli/
│       └── index.ts                  # CLI 入口
├── webview/                          # Vue 3 SPA 子工程
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                # base: './'，build.outDir: '../dist/webview'
│   ├── index.html
│   └── src/
│       ├── main.ts                   # 创建 app，挂 router/pinia
│       ├── App.vue                   # 顶层布局：AppNav + RouterView + StatusBar
│       ├── style.css                 # 全局基础样式（VS Code 主题变量适配）
│       ├── types/
│       │   └── ldf.ts                # 复制自 src/service/types.ts，避免跨工程相对路径
│       ├── api/
│       │   └── vscode.ts             # acquireVsCodeApi 包装：postMessage / onMessage / state
│       ├── router/
│       │   └── index.ts              # createRouter，定义 4 条路由
│       ├── stores/
│       │   └── ldfStore.ts           # Pinia store：数据 + pending changes + UI 状态 + actions
│       ├── views/
│       │   ├── OverviewView.vue      # FR-02 概览
│       │   ├── NodesView.vue         # FR-02 节点
│       │   ├── SignalsView.vue       # FR-03 信号 CRUD
│       │   └── FramesView.vue        # FR-04 帧 CRUD + 信号映射
│       └── components/
│           ├── AppNav.vue            # 顶部 Tab + 全局保存/刷新按钮
│           ├── StatusBar.vue         # 底部状态条（loading/error/未保存提示）
│           ├── ChangeBadge.vue       # 行级状态徽标：新建/修改/删除
│           ├── SignalForm.vue        # 信号创建/编辑模态
│           ├── FrameForm.vue         # 帧创建/编辑模态
│           ├── SignalMappingEditor.vue   # 帧内信号映射编辑
│           └── ConfirmDialog.vue     # 通用二次确认弹窗（刷新/丢弃变更）
├── tests/                            # vitest 单元/集成测试（Service Layer + CLI）
├── dist/
│   ├── extension.js                  # tsc 输出
│   ├── service/
│   ├── cli/
│   └── webview/                      # vite build 输出，被 Extension 加载
├── package.json                      # 根工程：Extension + CLI
└── tsconfig.json
```

## 8. 里程碑

1. **骨架** ✅ Service Layer 模块、Extension 编译配置、Python 桥接打通。
2. **展示数据通路** ✅ overview / nodes / signals / frames 全部从 Python 落地到 Extension。
3. **CLI** ✅ parse / info / signals / frames / validate 五个子命令，支持表格与 `--json`。
4. **前端 v1**：Vue 3 + Vite + Router + Pinia 脚手架；四个视图实现 FR-02 概览/节点（只读）+ FR-03/04 完整 CRUD + FR-05 二次确认刷新；首版作为 Vue 教学样例，注释中文且详尽。
5. **前端 v2（后续）**：表单验证细化、加载/空状态打磨、样式抛光、自动化端到端测试。

## 9. 前端实现规范（FR-07 详细约束）

### 9.1 技术栈与版本
- Vue 3.4+ 使用 Composition API + `<script setup lang="ts">`；禁止 Options API。
- Vite 5+ 作为构建器；`base: './'`，`build.outDir: '../dist/webview'`，`build.emptyOutDir: true`。
- Vue Router 4（hash 模式，避免 VS Code WebView 路径问题）。
- Pinia 2 作为状态管理；不引入 Vuex。
- TypeScript 5；前端 `tsconfig.json` 独立于根工程，但 `strict: true` 必须开启。
- 不引入 UI 组件库（Element Plus / Naive 等），样式自写，颜色优先使用 VS Code 主题 CSS 变量（`var(--vscode-foreground)` 等）。
- 单元测试用根工程已装的 vitest；Vue 组件测试需要 `@vue/test-utils` + `happy-dom` 或 `jsdom`，按需在 webview 子工程装。

### 9.2 通信契约（与 Extension 一致）
- `acquireVsCodeApi()` 只能调一次，封装在 `api/vscode.ts` 单例中。
- WebView → Extension：
  - `{ type: 'ready' }` 初次挂载发送
  - `{ type: 'requestRefresh' }` 二次确认通过后发送
  - `{ type: 'saveChanges', payload: { signals: LdfChange<LdfSignal>[]; frames: LdfChange<LdfFrame>[] } }`
- Extension → WebView：
  - `{ type: 'loading' }` → 进入 loading 顶层态
  - `{ type: 'ok', payload: LdfPayload }` → 写入 store，清空 pending changes
  - `{ type: 'error', payload: string, traceback?: string }` → 顶层错误屏
  - `{ type: 'saveError', payload: string }` → 状态条提示，pending changes 保留
- 消息处理使用 `window.addEventListener('message', ...)`，监听放在 store 初始化阶段，App.vue 的 `onMounted` 触发初次 `ready`。

### 9.3 Pinia store 形态（`stores/ldfStore.ts`）

```typescript
interface LdfState {
  // 后端最近一次 ok payload
  overview: LdfOverview | null;
  nodes: LdfNodes | null;
  signals: LdfSignal[];
  frames: LdfFrame[];

  // 用户暂存变更（保存前）
  pendingSignalChanges: LdfChange<LdfSignal>[];
  pendingFrameChanges: LdfChange<LdfFrame>[];

  // 顶层 UI 状态
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  saveErrorMessage: string | null;
}
```

Actions（命名按动词驱动，必须在 store 内完成 pending changes 维护）：
- `bootstrap()`：注册 message 监听，发送 `ready`。
- `requestRefresh()`：调用方负责弹二次确认，store 仅发送消息并清空 pending changes。
- `saveChanges()`：把两个 pending 列表打包发出；ok 回执到达后由消息处理 reset。
- 信号：`createSignal` / `updateSignal` / `markSignalDeleted` / `cancelSignalDelete`。
- 帧：`createFrame` / `updateFrame` / `markFrameDeleted` / `cancelFrameDelete` / `addSignalMapping` / `removeSignalMapping` / `updateSignalOffset`。
- Getters：`hasPendingChanges`、`signalRowState(name)`（返回 `'unchanged' | 'created' | 'updated' | 'deleted'`）、`frameRowState(name)` 同理。

> **状态可视化**：列表以 `signals` + `pendingSignalChanges` 合并视图渲染；删除项以置灰行展示并保留“撤销删除”按钮，新建/修改项加色块徽标（`ChangeBadge.vue`）。

### 9.4 视图与组件职责

| 视图 / 组件 | 关键职责 |
| --- | --- |
| `App.vue` | 顶层布局；`onMounted` 调 `bootstrap()`；监听全局错误屏 |
| `AppNav.vue` | 4 个 RouterLink Tab + 全局“保存”“刷新”按钮；显示 pending 数量 |
| `StatusBar.vue` | 显示 status / errorMessage / saveErrorMessage / pending 提示 |
| `OverviewView.vue` | 只读卡片展示 overview 5 个字段 |
| `NodesView.vue` | 只读展示 master 与 slaves（含 product_id 解析） |
| `SignalsView.vue` | 表格 + 新建按钮 + 行内编辑/删除/撤销；表单走 `SignalForm.vue` |
| `FramesView.vue` | 表格 + 新建按钮 + 行内编辑/删除；展开行用 `SignalMappingEditor.vue` 管理映射 |
| `SignalForm.vue` | 名称、宽度、初始值、publisher、subscribers；前端校验 width 1–64、init_value ≤ 2^width-1 |
| `FrameForm.vue` | 名称、frame_id、length、publisher；前端校验 frame_id 0–63、length 1–8 |
| `SignalMappingEditor.vue` | 信号下拉（来自 store.signals）+ offset 输入；校验 `offset + signal.width ≤ length * 8` |
| `ChangeBadge.vue` | 三色徽标：绿(新建)/黄(修改)/红(删除) |
| `ConfirmDialog.vue` | 通用确认弹窗，刷新与“关闭未保存”均复用 |

### 9.5 校验复用
- 校验逻辑必须与 `src/service/signalService._validateSignal`、`frameService._validateFrame`、`_validateMapping` 一致。
- 在 `webview/src/utils/validators.ts` 单独定义纯函数，**禁止**直接 import `src/service/*`（跨工程相对路径会污染 Vite）。
- 校验函数签名：`validateSignal(signal: LdfSignal): string | null`，返回首条错误信息或 `null`。

### 9.6 构建与集成
- Webview 子工程 `npm install` 后 `npm run build` 输出到 `../dist/webview/`，`extension.ts` 的 `getWebviewContent` 已适配。
- 根工程 `package.json` 增加脚本：
  ```json
  "build:webview": "cd webview && npm run build",
  "build": "npm run compile && npm run build:webview"
  ```
- CSP：`default-src 'none'; script-src ${nonce} 'unsafe-eval'; style-src ${nonce} 'unsafe-inline'; img-src ${webview.cspSource} data:;`。`'unsafe-eval'` 是 Vue 运行时模板编译需要；若全部用 SFC 预编译，可去掉。
- 静态资源 URL 在 Extension 端用 `webview.asWebviewUri` 重写，不要在 Vite 里写绝对路径。

### 9.7 测试
- store 层用 vitest 直接测 actions / getters，mock `api/vscode.ts` 的 `postMessage`。
- 关键组件（SignalForm 校验、ChangeBadge 渲染、SignalMappingEditor 上限）用 `@vue/test-utils` 写 1–2 个用例即可，重点保校验路径。
- 整体覆盖目标：webview/src 行覆盖 ≥ 80%，纯 UI 组件不强求。

## 10. 代码风格（webview v1 教学例外）

> 根目录 `CLAUDE.md` 的注释规范（“No WHAT comments / 仅写 WHY / 单行”）继续适用于 `src/`、`tests/`、`python/`。
> **`webview/` 子工程的 v1 版本作为 Vue 教学示例例外处理**，遵循以下约定：

- 每个 `.vue`、`.ts` 文件顶部用块注释说明：文件作用、对应 PRD 条款、关键设计取舍。
- 关键 API（`ref` / `computed` / `watch` / `defineProps` / `defineEmits` / `useRouter` / `defineStore` 等）首次出现处用一行中文注释解释“这个 API 在做什么、为什么用它”。
- Pinia store 的每个 action / getter 前用 1–3 行注释说明语义与触发时机。
- 涉及 VS Code WebView 特殊行为的位置（`acquireVsCodeApi`、CSP、`asWebviewUri`、消息协议）必须有 WHY 注释。
- 注释一律使用简体中文；术语（API 名、属性名、HTML 标签等）保留英文原样。
- 待 v2 抛光阶段，会按 `CLAUDE.md` 标准对教学注释做一次精简。
