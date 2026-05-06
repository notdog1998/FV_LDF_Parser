/** Shared domain types for LDF (LIN Description File) entities. */

export interface LdfSignal {
  name: string;
  width: number;        // 1–64 bits
  init_value: number;
  publisher?: string;
  subscribers?: string[];
}

export interface LdfFrame {
  name: string;
  frame_id: number;     // 0–63
  length: number;       // 1–8 bytes
  publisher?: string;
  signals: Array<{ signal: string; offset: number }>;
}

/** Header-level metadata shown on the WebView "概览" tab (FR-02). */
export interface LdfOverview {
  protocol_version: string;
  language_version: string;
  baudrate: number;
  channel?: string;
  // ldfparser does not store the checksum model; it is derived from protocol version per LIN spec.
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

/** Change descriptor used by WebView ↔ Extension ↔ Python pipeline.
 *  _action tells Python bridge whether to create, update or delete the entity.
 */
export interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;         // Frontend temp ID for items not yet persisted
  _editing?: boolean;   // Inline edit mode flag (UI concern)
  data: T;
}
