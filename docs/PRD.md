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
  width: number;
  init_value: number;
  publisher?: string;
  subscribers?: string[];
}

interface LdfFrame {
  name: string;
  frame_id: number;
  length: number;
  publisher?: string;
  signals: Array<{ signal: string; offset: number }>;
}

interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;
  _editing?: boolean;
  data: T;
}
```

## 7. 目录结构

```
vscode-ldf-explorer/
├── docs/PRD.md
├── python/
│   ├── ldfparser/          # [保留] 解析库
│   └── parse_ldf.py        # [保留] 桥接脚本
├── src/
│   ├── extension.ts        # Extension 入口
│   ├── service/            # [新增] 服务层模块
│   │   ├── ldfService.ts   # 业务逻辑封装
│   │   └── pythonBridge.ts # 调用 Python 封装
│   └── cli/                # [新增] CLI 工具
│       └── index.ts        # CLI 入口
├── webview/                # Vue 3 SPA
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── stores/
│   │   ├── components/
│   │   ├── views/
│   │   └── types/
│   └── vite.config.ts
├── dist/
│   ├── extension.js
│   └── webview/            # WebView 构建输出
├── package.json
└── tsconfig.json
```

## 8. 里程碑

1. **骨架**: Service Layer 模块、Extension 编译配置、Vite + Vue 3 初始化、三层通信链路打通。
2. **展示**: Vue Router 三视图、Service API 实现、只读展示解析数据。
3. **增删改查**: 信号和帧的完整 CRUD、Pinia 管理变更状态、保存写回文件。
4. **CLI**: 实现 CLI 各子命令，支持 JSON/表格输出。
5. **优化**: 表单验证、加载/空状态、样式优化、学习注释完善。
