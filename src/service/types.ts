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

/** Change descriptor used by WebView ↔ Extension ↔ Python pipeline.
 *  _action tells Python bridge whether to create, update or delete the entity.
 */
export interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;         // Frontend temp ID for items not yet persisted
  _editing?: boolean;   // Inline edit mode flag (UI concern)
  data: T;
}
