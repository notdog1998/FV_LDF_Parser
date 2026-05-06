/**
 * LDF 领域类型 — 与后端 src/service/types.ts 保持一致(对应 PRD §6)
 *
 * 重要约束:
 * - 这些接口必须与 src/service/types.ts 字段名/类型完全一致,因为 Python 桥
 *   通过 stdout 输出的 JSON 直接 cast 成这些结构,字段不一致会导致前端读不出数据。
 * - 任何字段变更必须同步修改后端 types.ts,然后重新跑后端测试套件验证。
 *
 * 此外本文件定义两类 WebView 专用类型:
 * 1. LdfPayload          : 后端一次性下发给前端的完整数据快照
 * 2. InboundMessage /    : WebView 与 Extension 之间 postMessage 协议的可辨别联合
 *    OutboundMessage       (PRD §9.2),前端 store 用 type 字段做 switch 分派
 */

export interface LdfSignal {
  name: string;
  width: number;
  init_value: number;
  publisher?: string;
  subscribers?: string[];
}

export interface LdfFrame {
  name: string;
  frame_id: number;
  length: number;
  publisher?: string;
  signals: Array<{ signal: string; offset: number }>;
}

export interface LdfOverview {
  protocol_version: string;
  language_version: string;
  baudrate: number;
  channel?: string;
  checksum_model?: 'classic' | 'enhanced';
}

export interface LdfProductId {
  supplier_id: number;
  function_id: number;
  variant: number;
}

export interface LdfMaster {
  name: string;
  timebase: number;
  jitter: number;
}

export interface LdfSlave {
  name: string;
  product_id?: LdfProductId;
  configured_nad?: number;
  initial_nad?: number;
}

export interface LdfNodes {
  master?: LdfMaster;
  slaves: LdfSlave[];
}

/**
 * 变更描述符 — store 维护的 pending 列表元素。
 *
 * - _action: 'create' 表示前端新增,保存时由 Python 桥转成 ldfparser 的新对象
 * - _action: 'update' 表示已有对象的字段修改
 * - _action: 'delete' 表示删除;不要从 signals/frames 数组里移除原对象,而是叠加
 *   一条 delete 变更让视图染灰显示(PRD §9.3)
 * - _id      : 仅 create 项需要,前端临时 ID,保存成功后由后端返回的真实 name 替换
 * - _editing : UI 关注的内联编辑状态,不会被发送给后端
 */
export interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;
  _editing?: boolean;
  data: T;
}

/**
 * 后端一次性返回的完整 LDF 数据快照,对应 ExtensionHost 的 buildPayload()。
 */
export interface LdfPayload {
  overview: LdfOverview;
  nodes: LdfNodes;
  signals: LdfSignal[];
  frames: LdfFrame[];
}

/* ============================================================
 * postMessage 协议 — PRD §9.2
 *
 * Extension → WebView : InboundMessage(WebView 视角是「入站」)
 * WebView    → Extension : OutboundMessage
 *
 * 用可辨别联合(discriminated union)而不是 any,可以让 store 在 switch
 * 分派时获得类型收窄,避免拼错字段名。
 * ============================================================ */

export interface InboundLoading {
  type: 'loading';
}
export interface InboundOk {
  type: 'ok';
  payload: LdfPayload;
}
export interface InboundError {
  type: 'error';
  payload: string;
  traceback?: string;
}
export interface InboundSaveError {
  type: 'saveError';
  payload: string;
}
export type InboundMessage =
  | InboundLoading
  | InboundOk
  | InboundError
  | InboundSaveError;

export interface OutboundReady {
  type: 'ready';
}
export interface OutboundRequestRefresh {
  type: 'requestRefresh';
}
export interface OutboundSaveChanges {
  type: 'saveChanges';
  payload: {
    signals: LdfChange<LdfSignal>[];
    frames: LdfChange<LdfFrame>[];
  };
}
export type OutboundMessage =
  | OutboundReady
  | OutboundRequestRefresh
  | OutboundSaveChanges;
