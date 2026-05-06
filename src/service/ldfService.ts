import type { PythonBridge } from './pythonBridge';
import { SignalService } from './signalService';
import { FrameService } from './frameService';
import type { LdfOverview, LdfNodes } from './types';

/** Aggregates SignalService + FrameService and caches read-only header/node data.
 *  open() performs the initial parse; refresh() re-parses and rebuilds everything,
 *  discarding any uncommitted changes (FR-05).
 *  Header/node data is currently read-only — only signals and frames support CRUD.
 */
export class LdfService {
  signalService: SignalService;
  frameService: FrameService;
  private overview: LdfOverview;
  private nodes: LdfNodes;

  private constructor(
    private bridge: PythonBridge,
    private filePath: string,
    initialData: any
  ) {
    this.signalService = new SignalService(bridge, filePath, initialData.signals || []);
    this.frameService = new FrameService(bridge, this.signalService, filePath, initialData.frames || []);
    this.overview = LdfService._normalizeOverview(initialData.overview);
    this.nodes = LdfService._normalizeNodes(initialData.nodes);
  }

  static async open(bridge: PythonBridge, filePath: string): Promise<LdfService> {
    const data = await bridge.parseFile(filePath);
    return new LdfService(bridge, filePath, data);
  }

  /** Returns the LDF header overview (defensive copy). */
  getOverview(): LdfOverview {
    return { ...this.overview };
  }

  /** Returns master + slaves (defensive copy of every nested structure). */
  getNodes(): LdfNodes {
    return {
      master: this.nodes.master ? { ...this.nodes.master } : undefined,
      slaves: this.nodes.slaves.map((slave) => ({
        ...slave,
        product_id: slave.product_id ? { ...slave.product_id } : undefined,
      })),
    };
  }

  /** Commits signal changes first, then frame changes (frames may reference new signals). */
  async save(): Promise<void> {
    await this.signalService.commit();
    await this.frameService.commit();
  }

  /** Re-parses the file from disk and replaces all in-memory state, dropping pending changes. */
  async refresh(): Promise<void> {
    const data = await this.bridge.parseFile(this.filePath);
    this.signalService = new SignalService(this.bridge, this.filePath, data.signals || []);
    this.frameService = new FrameService(this.bridge, this.signalService, this.filePath, data.frames || []);
    this.overview = LdfService._normalizeOverview(data.overview);
    this.nodes = LdfService._normalizeNodes(data.nodes);
  }

  /** Coerces missing/partial overview payloads into a stable shape so consumers don't see undefined. */
  private static _normalizeOverview(raw: any): LdfOverview {
    const overview: LdfOverview = {
      protocol_version: raw?.protocol_version ?? '',
      language_version: raw?.language_version ?? '',
      baudrate: typeof raw?.baudrate === 'number' ? raw.baudrate : 0,
    };
    if (raw?.channel) overview.channel = raw.channel;
    if (raw?.checksum_model === 'classic' || raw?.checksum_model === 'enhanced') {
      overview.checksum_model = raw.checksum_model;
    }
    return overview;
  }

  private static _normalizeNodes(raw: any): LdfNodes {
    const slaves = Array.isArray(raw?.slaves) ? raw.slaves : [];
    return {
      master: raw?.master ? { ...raw.master } : undefined,
      slaves: slaves.map((s: any) => ({ ...s })),
    };
  }
}
