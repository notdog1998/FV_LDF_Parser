import type { LdfSignal, LdfChange } from './types';
import type { PythonBridge } from './pythonBridge';

/** Manages signal CRUD with in-memory caching (Strategy C).
 *  - cache: current view of signals (includes uncommitted changes).
 *  - pendingChanges: staged create/update/delete ops sent to Python on commit().
 *  - originalCache: snapshot at load time; used by cancelDelete to restore deleted signals.
 *  list()/get() return shallow copies so callers cannot corrupt internal state.
 */
export class SignalService {
  private cache: Map<string, LdfSignal>;
  private pendingChanges: LdfChange<LdfSignal>[] = [];
  private originalCache: Map<string, LdfSignal>;

  constructor(
    private bridge: PythonBridge,
    private filePath: string,
    initialData: LdfSignal[] = []
  ) {
    this.originalCache = new Map(initialData.map(s => [s.name, { ...s }]));
    this.cache = new Map(initialData.map(s => [s.name, { ...s }]));
  }

  /** Returns all signals in cache (defensive copy). */
  list(): LdfSignal[] {
    return Array.from(this.cache.values()).map(s => ({ ...s }));
  }

  /** Returns a single signal or undefined (defensive copy). */
  get(name: string): LdfSignal | undefined {
    const signal = this.cache.get(name);
    return signal ? { ...signal } : undefined;
  }

  create(data: LdfSignal): LdfChange<LdfSignal> {
    this._validateSignal(data);

    const change: LdfChange<LdfSignal> = { _action: 'create', data };
    this.cache.set(data.name, { ...data });
    this.pendingChanges.push(change);
    return change;
  }

  update(name: string, data: Partial<LdfSignal>): LdfChange<LdfSignal> {
    const existing = this.cache.get(name);
    if (!existing) {
      throw new Error(`Signal not found: ${name}`);
    }

    const updated = { ...existing, ...data };
    this._validateSignal(updated);

    this.cache.set(name, updated);

    const change: LdfChange<LdfSignal> = { _action: 'update', data: updated };
    this.pendingChanges.push(change);
    return change;
  }

  delete(name: string): LdfChange<LdfSignal> {
    const existing = this.cache.get(name);
    if (!existing) {
      throw new Error(`Signal not found: ${name}`);
    }

    this.cache.delete(name);

    const change: LdfChange<LdfSignal> = { _action: 'delete', data: existing };
    this.pendingChanges.push(change);
    return change;
  }

  /** Applies a batch of changes from WebView (e.g. saveChanges payload).
   *  If a 'create' targets an already-existing signal (present in originalCache),
   *  it is silently upgraded to 'update' so Python bridge never sees an invalid create.
   */
  applyChanges(changes: LdfChange<LdfSignal>[]): void {
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

  /** Removes a staged deletion and restores the signal from originalCache. */
  cancelDelete(name: string): boolean {
    const idx = this.pendingChanges.findIndex(
      c => c._action === 'delete' && c.data.name === name
    );
    if (idx === -1) return false;

    this.pendingChanges.splice(idx, 1);
    const original = this.originalCache.get(name);
    if (original) {
      this.cache.set(name, { ...original });
    }
    return true;
  }

  getPendingChanges(): LdfChange<LdfSignal>[] {
    return [...this.pendingChanges];
  }

  /** Sends pending changes to Python, then clears the staging area.
   *  Cache is already the correct state (Strategy C); no re-parse needed.
   */
  async commit(): Promise<void> {
    await this.bridge.saveFile(this.filePath, {
      signals: this.pendingChanges,
      frames: []
    });
    this.pendingChanges = [];
    this.originalCache = new Map(this.cache);
  }

  /** Validates signal constraints: width 1–64, init_value fits within width bits.
   *  Uses Math.pow instead of bit-shift to avoid overflow at width === 64.
   */
  private _validateSignal(signal: LdfSignal): void {
    if (!signal.name || signal.name.trim() === '') {
      throw new Error('Signal name is required');
    }
    if (signal.width < 1 || signal.width > 64) {
      throw new Error(`Signal width must be between 1 and 64, got ${signal.width}`);
    }
    const maxValue = Math.pow(2, signal.width) - 1;
    if (signal.init_value < 0 || signal.init_value > maxValue) {
      throw new Error(
        `Signal init_value must be between 0 and ${maxValue} for width ${signal.width}, got ${signal.init_value}`
      );
    }
  }
}
