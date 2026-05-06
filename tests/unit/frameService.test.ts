import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FrameService } from '../../src/service/frameService';
import type { LdfFrame, LdfSignal, LdfChange } from '../../src/service/types';

// Covers FR-04: Frame CRUD + signal mapping (PRD §3, §6).
// Validates frame_id 0–63, length 1–8 bytes, offset+width ≤ frame capacity, and Map deduplication.

// FrameService uses a Map for pendingChanges so each frame has at most one outstanding change.
// Signal mapping mutations (add/remove/offset) are recorded as frame updates (or create upgrades).
describe('FrameService', () => {
  let mockBridge: { saveFile: ReturnType<typeof vi.fn> };
  let mockSignalService: { get: ReturnType<typeof vi.fn> };
  let service: FrameService;

  const sampleFrames: LdfFrame[] = [
    {
      name: 'EngineFrame',
      frame_id: 10,
      length: 8,
      publisher: 'Master',
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
    mockSignalService = { get: vi.fn() };
    service = new FrameService(
      mockBridge as any,
      mockSignalService as any,
      '/test.ldf',
      sampleFrames
    );
  });

  describe('query', () => {
    it('should list all frames from initial cache', () => {
      const frames = service.list();
      expect(frames).toHaveLength(2);
      expect(frames.map((f) => f.name)).toContain('EngineFrame');
    });

    it('should get frame by name', () => {
      const frame = service.get('EngineFrame');
      expect(frame).toBeDefined();
      expect(frame?.frame_id).toBe(10);
      expect(frame?.signals).toHaveLength(2);
    });

    it('should return undefined for non-existent frame', () => {
      expect(service.get('NonExistent')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should stage frame creation with _action=create', () => {
      const newFrame: LdfFrame = {
        name: 'NewFrame',
        frame_id: 30,
        length: 2,
        publisher: 'Master',
        signals: [],
      };
      const change = service.create(newFrame);

      expect(change._action).toBe('create');
      expect(change.data).toEqual(newFrame);
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    it('should add created frame to cache immediately', () => {
      service.create({
        name: 'NewFrame',
        frame_id: 30,
        length: 2,
        publisher: 'Master',
        signals: [],
      });
      expect(service.get('NewFrame')).toBeDefined();
      expect(service.list()).toHaveLength(3);
    });

    it('should reject frame_id less than 0', () => {
      expect(() =>
        service.create({ name: 'Bad', frame_id: -1, length: 1, signals: [] })
      ).toThrow('frame_id');
    });

    it('should reject frame_id greater than 63', () => {
      expect(() =>
        service.create({ name: 'Bad', frame_id: 64, length: 1, signals: [] })
      ).toThrow('frame_id');
    });

    it('should reject length less than 1', () => {
      expect(() =>
        service.create({ name: 'Bad', frame_id: 0, length: 0, signals: [] })
      ).toThrow('length');
    });

    it('should reject length greater than 8', () => {
      expect(() =>
        service.create({ name: 'Bad', frame_id: 0, length: 9, signals: [] })
      ).toThrow('length');
    });
  });

  describe('update', () => {
    it('should stage frame update with _action=update', () => {
      const change = service.update('EngineFrame', { length: 4 });

      expect(change._action).toBe('update');
      expect(change.data.length).toBe(4);
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    it('should update cache immediately', () => {
      service.update('EngineFrame', { frame_id: 15 });
      expect(service.get('EngineFrame')?.frame_id).toBe(15);
    });

    it('should throw for non-existent frame', () => {
      expect(() => service.update('NonExistent', { length: 4 })).toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should stage frame deletion with _action=delete', () => {
      const change = service.delete('EngineFrame');

      expect(change._action).toBe('delete');
      expect(change.data.name).toBe('EngineFrame');
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    it('should remove frame from cache immediately', () => {
      service.delete('EngineFrame');
      expect(service.get('EngineFrame')).toBeUndefined();
      expect(service.list()).toHaveLength(1);
    });

    it('should throw for non-existent frame', () => {
      expect(() => service.delete('NonExistent')).toThrow('not found');
    });
  });

  // Signal mapping operations rely on SignalService for existence checks
  // and validate that offset + signal.width fits inside frame.length * 8.
  describe('signal mapping', () => {
    beforeEach(() => {
      // Mock SignalService.get so mapping methods can resolve signal metadata.
      mockSignalService.get.mockImplementation((name: string) => {
        const signals: Record<string, LdfSignal> = {
          EngineSpeed: { name: 'EngineSpeed', width: 8, init_value: 0 },
          EngineTemp: { name: 'EngineTemp', width: 8, init_value: 0 },
          DoorStatus: { name: 'DoorStatus', width: 1, init_value: 0 },
          NewSignal: { name: 'NewSignal', width: 16, init_value: 0 },
        };
        return signals[name];
      });
    });

    it('should add signal mapping to frame', () => {
      service.addSignalMapping('EngineFrame', 'NewSignal', 16);

      const frame = service.get('EngineFrame');
      expect(frame?.signals).toHaveLength(3);
      expect(frame?.signals).toContainEqual({ signal: 'NewSignal', offset: 16 });
    });

    it('should throw when signal does not exist', () => {
      expect(() =>
        service.addSignalMapping('EngineFrame', 'UnknownSignal', 0)
      ).toThrow('not found');
    });

    // EngineFrame length=8 bytes = 64 bits; NewSignal width=16 at offset=56 overflows (72 > 64).
    it('should throw when signal mapping exceeds frame capacity', () => {
      expect(() =>
        service.addSignalMapping('EngineFrame', 'NewSignal', 56)
      ).toThrow('exceeds');
    });

    it('should remove signal mapping from frame', () => {
      service.removeSignalMapping('EngineFrame', 'EngineSpeed');

      const frame = service.get('EngineFrame');
      expect(frame?.signals).toHaveLength(1);
      expect(frame?.signals.find((s) => s.signal === 'EngineSpeed')).toBeUndefined();
    });

    it('should update signal offset in frame', () => {
      service.updateSignalOffset('EngineFrame', 'EngineSpeed', 32);

      const frame = service.get('EngineFrame');
      const mapping = frame?.signals.find((s) => s.signal === 'EngineSpeed');
      expect(mapping?.offset).toBe(32);
    });

    // EngineSpeed width=8 at offset=60 overflows in an 8-byte frame (68 > 64).
    it('should validate offset on update', () => {
      expect(() =>
        service.updateSignalOffset('EngineFrame', 'EngineSpeed', 60)
      ).toThrow('exceeds');
    });

    // Signal mapping mutations are recorded as frame-level pending changes.
    it('should record signal mapping changes in pendingChanges', () => {
      service.addSignalMapping('EngineFrame', 'NewSignal', 16);

      const pending = service.getPendingChanges();
      expect(pending).toHaveLength(1);
      expect(pending[0]._action).toBe('update');
      expect(pending[0].data.signals).toContainEqual({ signal: 'NewSignal', offset: 16 });
    });
  });

  describe('commit', () => {
    it('should send pending frame changes to bridge', async () => {
      service.create({
        name: 'NewFrame',
        frame_id: 30,
        length: 2,
        publisher: 'Master',
        signals: [],
      });

      await service.commit();

      expect(mockBridge.saveFile).toHaveBeenCalledTimes(1);
      const sent = mockBridge.saveFile.mock.calls[0][1].frames as LdfChange<LdfFrame>[];
      expect(sent).toHaveLength(1);
      expect(sent[0]._action).toBe('create');
    });

    it('should clear pending changes after commit', async () => {
      service.update('EngineFrame', { length: 4 });
      await service.commit();

      expect(service.getPendingChanges()).toHaveLength(0);
    });
  });

  describe('applyChanges', () => {
    it('should apply create change for new frame', () => {
      service.applyChanges([
        { _action: 'create', data: { name: 'AppliedFrame', frame_id: 30, length: 2, signals: [] } },
      ]);
      expect(service.get('AppliedFrame')).toBeDefined();
      expect(service.getPendingChanges()[0]._action).toBe('create');
    });

    it('should apply update change for existing frame', () => {
      service.applyChanges([
        { _action: 'update', data: { name: 'EngineFrame', frame_id: 50, length: 8, signals: [] } },
      ]);
      expect(service.get('EngineFrame')?.frame_id).toBe(50);
      expect(service.getPendingChanges()[0]._action).toBe('update');
    });

    it('should apply delete change', () => {
      service.applyChanges([
        { _action: 'delete', data: { name: 'EngineFrame', frame_id: 10, length: 8, signals: [] } },
      ]);
      expect(service.get('EngineFrame')).toBeUndefined();
      expect(service.getPendingChanges()[0]._action).toBe('delete');
    });

    // Same create→update promotion as SignalService to avoid invalid create ops on the Python side.
    it('should convert create to update for existing frame', () => {
      service.applyChanges([
        { _action: 'create', data: { name: 'EngineFrame', frame_id: 50, length: 4, signals: [] } },
      ]);
      expect(service.get('EngineFrame')?.frame_id).toBe(50);
      expect(service.getPendingChanges()[0]._action).toBe('update');
    });
  });
});
