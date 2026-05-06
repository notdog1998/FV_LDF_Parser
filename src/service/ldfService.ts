import type { PythonBridge } from './pythonBridge';
import { SignalService } from './signalService';
import { FrameService } from './frameService';

/** Aggregates SignalService + FrameService.
 *  open() performs the initial parse; refresh() re-parses and rebuilds both services,
 *  discarding any uncommitted changes (as required by FR-05).
 */
export class LdfService {
  signalService: SignalService;
  frameService: FrameService;

  private constructor(
    private bridge: PythonBridge,
    private filePath: string,
    initialData: any
  ) {
    const signals = initialData.signals || [];
    const frames = initialData.frames || [];
    this.signalService = new SignalService(bridge, filePath, signals);
    this.frameService = new FrameService(bridge, this.signalService, filePath, frames);
  }

  static async open(bridge: PythonBridge, filePath: string): Promise<LdfService> {
    const data = await bridge.parseFile(filePath);
    return new LdfService(bridge, filePath, data);
  }

  /** Commits signal changes first, then frame changes (order matters: frames may reference new signals). */
  async save(): Promise<void> {
    await this.signalService.commit();
    await this.frameService.commit();
  }

  /** Re-parses the file from disk and replaces both services, dropping all pending changes. */
  async refresh(): Promise<void> {
    const data = await this.bridge.parseFile(this.filePath);
    const signals = data.signals || [];
    const frames = data.frames || [];
    this.signalService = new SignalService(this.bridge, this.filePath, signals);
    this.frameService = new FrameService(this.bridge, this.signalService, this.filePath, frames);
  }
}
