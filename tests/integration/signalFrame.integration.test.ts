import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SignalService } from '../../src/service/signalService';
import { FrameService } from '../../src/service/frameService';
import type { LdfSignal, LdfFrame, LdfChange } from '../../src/service/types';

/**
 * Covers FR-03 + FR-04 integration: signal-frame lifecycle and cross-module consistency (PRD §3).
 * Scenarios: create signal → map to frame, signal deletion blocks frame ops, width change invalidates mapping.
 * PythonBridge is mocked; both services use real instances to test cross-module behavior.
 */
describe('SignalFrame Integration', () => {
  let mockBridge: { saveFile: ReturnType<typeof vi.fn> };
  let signalService: SignalService;
  let frameService: FrameService;

  const initialSignals: LdfSignal[] = [
    { name: 'EngineSpeed', width: 8, init_value: 0, publisher: 'MasterNode', subscribers: ['Slave1'] },
    { name: 'EngineTemp', width: 8, init_value: 0, publisher: 'MasterNode', subscribers: ['Slave1'] },
    { name: 'DoorStatus', width: 1, init_value: 0, publisher: 'Slave1', subscribers: ['MasterNode'] },
  ];

  const initialFrames: LdfFrame[] = [
    {
      name: 'EngineFrame',
      frame_id: 10,
      length: 8,
      publisher: 'MasterNode',
      signals: [
        { signal: 'EngineSpeed', offset: 0 },
        { signal: 'EngineTemp', offset: 8 },
      ],
    },
    {
      name: 'BodyFrame',
      frame_id: 20,
      length: 4,
      publisher: 'Slave1',
      signals: [{ signal: 'DoorStatus', offset: 0 }],
    },
  ];

  beforeEach(() => {
    mockBridge = { saveFile: vi.fn().mockResolvedValue(undefined) };
    signalService = new SignalService(mockBridge as any, '/test.ldf', initialSignals);
    frameService = new FrameService(mockBridge as any, signalService, '/test.ldf', initialFrames);
  });

  describe('scenario 1: create signal then map it to frame', () => {
    it('should allow creating a signal and mapping it to a frame in one flow', () => {
      signalService.create({ name: 'NewSignal', width: 16, init_value: 0 });
      expect(signalService.get('NewSignal')).toBeDefined();

      frameService.addSignalMapping('EngineFrame', 'NewSignal', 16);
      const frame = frameService.get('EngineFrame');
      expect(frame?.signals).toContainEqual({ signal: 'NewSignal', offset: 16 });

      // Signal mapping mutations are recorded as frame-level pending changes.
      const frameChanges = frameService.getPendingChanges();
      expect(frameChanges).toHaveLength(1);
      expect(frameChanges[0]._action).toBe('update');
      expect(frameChanges[0].data.signals).toContainEqual({ signal: 'NewSignal', offset: 16 });
    });

    // Signal and frame commits are independent; both must be called to persist the full transaction.
    it('should commit both signal and frame changes together', async () => {
      signalService.create({ name: 'NewSignal', width: 16, init_value: 0 });
      frameService.addSignalMapping('EngineFrame', 'NewSignal', 16);

      await signalService.commit();
      await frameService.commit();

      expect(mockBridge.saveFile).toHaveBeenCalledTimes(2);

      const signalCall = mockBridge.saveFile.mock.calls[0];
      expect(signalCall[1].signals).toHaveLength(1);
      expect(signalCall[1].signals[0]._action).toBe('create');

      const frameCall = mockBridge.saveFile.mock.calls[1];
      expect(frameCall[1].frames).toHaveLength(1);
      expect(frameCall[1].frames[0]._action).toBe('update');
    });

    // Strategy C: cache is the source of truth after commit; no re-parse needed.
    it('should reflect committed changes without re-parsing (strategy C)', async () => {
      signalService.create({ name: 'NewSignal', width: 16, init_value: 0 });
      frameService.addSignalMapping('EngineFrame', 'NewSignal', 16);

      await signalService.commit();
      await frameService.commit();

      expect(signalService.get('NewSignal')).toBeDefined();
      const frame = frameService.get('EngineFrame');
      expect(frame?.signals).toHaveLength(3);
      expect(frame?.signals).toContainEqual({ signal: 'NewSignal', offset: 16 });

      // No additional bridge calls happened after commit.
      expect(mockBridge.saveFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('scenario 2: signal deletion affects frame mapping operations', () => {
    // FrameService validates signal existence via SignalService.get on every mapping mutation.
    it('should prevent adding mapping for a deleted signal', () => {
      signalService.delete('EngineSpeed');
      expect(signalService.get('EngineSpeed')).toBeUndefined();

      expect(() => {
        frameService.addSignalMapping('EngineFrame', 'EngineSpeed', 32);
      }).toThrow('Signal not found: EngineSpeed');
    });

    it('should prevent updating offset for a deleted signal', () => {
      signalService.delete('EngineSpeed');

      expect(() => {
        frameService.updateSignalOffset('EngineFrame', 'EngineSpeed', 32);
      }).toThrow('Signal not found: EngineSpeed');
    });
  });

  describe('scenario 3: signal width update causes frame mapping overflow', () => {
    // Changing a signal's width can invalidate existing or proposed mappings.
    it('should reject mapping when signal width exceeds frame capacity', () => {
      signalService.update('EngineSpeed', { width: 16 });

      // EngineFrame is 8 bytes = 64 bits; offset 56 + width 16 = 72 > 64.
      expect(() => {
        frameService.updateSignalOffset('EngineFrame', 'EngineSpeed', 56);
      }).toThrow('exceeds frame capacity');
    });

    it('should reject adding new mapping that exceeds frame capacity', () => {
      signalService.create({ name: 'WideSignal', width: 32, init_value: 0 });

      // offset 40 + width 32 = 72 > 64.
      expect(() => {
        frameService.addSignalMapping('EngineFrame', 'WideSignal', 40);
      }).toThrow('exceeds frame capacity');
    });
  });

  describe('cross-service consistency', () => {
    // Newly-created signals must be visible to FrameService in the same session.
    it('should allow frame to reference signal created in same session', () => {
      signalService.create({ name: 'SessionSignal', width: 4, init_value: 0 });

      frameService.create({
        name: 'SessionFrame',
        frame_id: 30,
        length: 2,
        publisher: 'MasterNode',
        signals: [{ signal: 'SessionSignal', offset: 0 }],
      });

      const frame = frameService.get('SessionFrame');
      expect(frame?.signals).toContainEqual({ signal: 'SessionSignal', offset: 0 });
    });

    // SignalService and FrameService manage independent pending change lists.
    it('should preserve independent pending changes in each service', async () => {
      signalService.create({ name: 'SigA', width: 8, init_value: 0 });
      frameService.create({
        name: 'FrameA',
        frame_id: 30,
        length: 2,
        publisher: 'MasterNode',
        signals: [],
      });

      expect(signalService.getPendingChanges()).toHaveLength(1);
      expect(frameService.getPendingChanges()).toHaveLength(1);

      await signalService.commit();
      expect(signalService.getPendingChanges()).toHaveLength(0);
      expect(frameService.getPendingChanges()).toHaveLength(1); // frames still pending

      await frameService.commit();
      expect(frameService.getPendingChanges()).toHaveLength(0);
    });
  });
});
