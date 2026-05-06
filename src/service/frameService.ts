import type { LdfFrame, LdfChange } from './types';
import type { PythonBridge } from './pythonBridge';
import type { SignalService } from './signalService';

/** Manages unconditional frame CRUD and signal mapping.
 *  Uses Map for pendingChanges so each frame has at most one outstanding change
 *  (create is kept as create; everything else becomes update).
 */
export class FrameService {
  private cache: Map<string, LdfFrame>;
  private pendingChanges: Map<string, LdfChange<LdfFrame>> = new Map();
  private originalCache: Map<string, LdfFrame>;

  constructor(
    private bridge: PythonBridge,
    private signalService: SignalService,
    private filePath: string,
    initialData: LdfFrame[] = []
  ) {
    this.originalCache = new Map(initialData.map((f) => [f.name, { ...f, signals: [...f.signals] }]));
    this.cache = new Map(initialData.map((f) => [f.name, { ...f, signals: [...f.signals] }]));
  }

  list(): LdfFrame[] {
    return Array.from(this.cache.values()).map((f) => ({
      ...f,
      signals: [...f.signals],
    }));
  }

  get(name: string): LdfFrame | undefined {
    const frame = this.cache.get(name);
    return frame
      ? { ...frame, signals: [...frame.signals] }
      : undefined;
  }

  create(data: LdfFrame): LdfChange<LdfFrame> {
    this._validateFrame(data);

    const change: LdfChange<LdfFrame> = { _action: 'create', data };
    this.cache.set(data.name, { ...data, signals: [...data.signals] });
    this.pendingChanges.set(data.name, change);
    return change;
  }

  update(name: string, data: Partial<LdfFrame>): LdfChange<LdfFrame> {
    const existing = this.cache.get(name);
    if (!existing) {
      throw new Error(`Frame not found: ${name}`);
    }

    const updated = { ...existing, ...data, signals: data.signals ? [...data.signals] : [...existing.signals] };
    this._validateFrame(updated);

    this.cache.set(name, updated);

    const change: LdfChange<LdfFrame> = { _action: 'update', data: updated };
    this.pendingChanges.set(name, change);
    return change;
  }

  delete(name: string): LdfChange<LdfFrame> {
    const existing = this.cache.get(name);
    if (!existing) {
      throw new Error(`Frame not found: ${name}`);
    }

    this.cache.delete(name);

    const change: LdfChange<LdfFrame> = { _action: 'delete', data: existing };
    this.pendingChanges.set(name, change);
    return change;
  }

  /** Batch-apply changes from WebView. Same create→update promotion as SignalService. */
  applyChanges(changes: LdfChange<LdfFrame>[]): void {
    for (const change of changes) {
      const isNew = !this.originalCache.has(change.data.name);
      if (change._action === 'create' && !isNew) {
        this.update(change.data.name, change.data);
      } else if (change._action === 'create') {
        this.create(change.data);
      } else if (change._action === 'update') {
        this.update(change.data.name, change.data);
      } else if (change._action === 'delete') {
        this.delete(change.data.name);
      }
    }
  }

  /** Adds a signal mapping after validating signal existence and frame capacity. */
  addSignalMapping(frameName: string, signalName: string, offset: number): void {
    const frame = this.cache.get(frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }

    const signal = this.signalService.get(signalName);
    if (!signal) {
      throw new Error(`Signal not found: ${signalName}`);
    }

    this._validateMapping(frame, signal.width, offset);

    const updatedSignals = [...frame.signals, { signal: signalName, offset }];
    const updated = { ...frame, signals: updatedSignals };
    this.cache.set(frameName, updated);

    this._recordFrameChange(frameName, updated);
  }

  removeSignalMapping(frameName: string, signalName: string): void {
    const frame = this.cache.get(frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }

    const updatedSignals = frame.signals.filter((s) => s.signal !== signalName);
    const updated = { ...frame, signals: updatedSignals };
    this.cache.set(frameName, updated);

    this._recordFrameChange(frameName, updated);
  }

  updateSignalOffset(frameName: string, signalName: string, offset: number): void {
    const frame = this.cache.get(frameName);
    if (!frame) {
      throw new Error(`Frame not found: ${frameName}`);
    }

    const signal = this.signalService.get(signalName);
    if (!signal) {
      throw new Error(`Signal not found: ${signalName}`);
    }

    this._validateMapping(frame, signal.width, offset);

    const updatedSignals = frame.signals.map((s) =>
      s.signal === signalName ? { signal: signalName, offset } : s
    );
    const updated = { ...frame, signals: updatedSignals };
    this.cache.set(frameName, updated);

    this._recordFrameChange(frameName, updated);
  }

  getPendingChanges(): LdfChange<LdfFrame>[] {
    return Array.from(this.pendingChanges.values());
  }

  async commit(): Promise<void> {
    const changes = Array.from(this.pendingChanges.values());
    await this.bridge.saveFile(this.filePath, {
      signals: [],
      frames: changes,
    });
    this.pendingChanges.clear();
    this.originalCache = new Map(
      Array.from(this.cache).map(([k, v]) => [k, { ...v, signals: [...v.signals] }])
    );
  }

  private _validateFrame(frame: LdfFrame): void {
    if (frame.frame_id < 0 || frame.frame_id > 63) {
      throw new Error(
        `Frame frame_id must be between 0 and 63, got ${frame.frame_id}`
      );
    }
    if (frame.length < 1 || frame.length > 8) {
      throw new Error(
        `Frame length must be between 1 and 8 bytes, got ${frame.length}`
      );
    }
  }

  /** Validates that a signal fits inside the frame at the given bit offset. */
  private _validateMapping(
    frame: LdfFrame,
    signalWidth: number,
    offset: number
  ): void {
    const frameBits = frame.length * 8;
    if (offset + signalWidth > frameBits) {
      throw new Error(
        `Signal mapping exceeds frame capacity: offset ${offset} + width ${signalWidth} > ${frameBits} bits`
      );
    }
  }

  /** Deduplicates pending changes: keep create as create, everything else becomes update. */
  private _recordFrameChange(frameName: string, updatedFrame: LdfFrame): void {
    const existingChange = this.pendingChanges.get(frameName);
    if (existingChange?._action === 'create') {
      this.pendingChanges.set(frameName, {
        ...existingChange,
        data: updatedFrame,
      });
    } else {
      this.pendingChanges.set(frameName, {
        _action: 'update',
        data: updatedFrame,
      });
    }
  }
}
