import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SignalService } from '../../src/service/signalService';
import type { LdfSignal, LdfChange } from '../../src/service/types';

// Covers FR-03: Signal CRUD (create, update, delete, cancel) with state management (PRD §3, §6).
// Validates width 1–64, init_value bounds, Strategy C cache semantics, and applyChanges upgrade logic.

// Tests verify the "Strategy C" in-memory cache behavior:
//   create/update/delete mutate cache immediately;
//   commit persists pendingChanges to Python and clears the staging area.
describe('SignalService', () => {
  let mockBridge: { saveFile: ReturnType<typeof vi.fn> };
  let service: SignalService;

  const sampleSignals: LdfSignal[] = [
    { name: 'EngineSpeed', width: 8, init_value: 0, publisher: 'Master', subscribers: ['Slave1'] },
    { name: 'VehicleSpeed', width: 16, init_value: 100, publisher: 'Slave1', subscribers: ['Master'] },
  ];

  beforeEach(() => {
    mockBridge = { saveFile: vi.fn().mockResolvedValue(undefined) };
    service = new SignalService(mockBridge as any, '/test.ldf', sampleSignals);
  });

  describe('query', () => {
    it('should list all signals from initial cache', () => {
      const signals = service.list();
      expect(signals).toHaveLength(2);
      expect(signals.map(s => s.name)).toContain('EngineSpeed');
      expect(signals.map(s => s.name)).toContain('VehicleSpeed');
    });

    it('should get signal by name', () => {
      const signal = service.get('EngineSpeed');
      expect(signal).toBeDefined();
      expect(signal?.width).toBe(8);
    });

    it('should return undefined for non-existent signal', () => {
      expect(service.get('NonExistent')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should stage signal creation with _action=create', () => {
      const newSignal: LdfSignal = { name: 'NewSignal', width: 4, init_value: 5 };
      const change = service.create(newSignal);

      expect(change._action).toBe('create');
      expect(change.data).toEqual(newSignal);
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    // Strategy C: cache reflects uncommitted changes immediately.
    it('should add created signal to cache immediately', () => {
      service.create({ name: 'NewSignal', width: 4, init_value: 5 });
      expect(service.get('NewSignal')).toBeDefined();
      expect(service.list()).toHaveLength(3);
    });

    it('should reject empty signal name', () => {
      expect(() => service.create({ name: '', width: 8, init_value: 0 })).toThrow('Signal name is required');
    });

    it('should reject width less than 1', () => {
      expect(() => service.create({ name: 'Bad', width: 0, init_value: 0 })).toThrow('width');
    });

    it('should reject width greater than 64', () => {
      expect(() => service.create({ name: 'Bad', width: 65, init_value: 0 })).toThrow('width');
    });

    // init_value must fit within the bit-width (Math.pow avoids bit-shift overflow at width=64).
    it('should reject init_value exceeding width capacity', () => {
      expect(() => service.create({ name: 'Bad', width: 4, init_value: 16 })).toThrow('init_value');
    });
  });

  describe('update', () => {
    it('should stage signal update with _action=update', () => {
      const change = service.update('EngineSpeed', { init_value: 255 });

      expect(change._action).toBe('update');
      expect(change.data.init_value).toBe(255);
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    it('should update cache immediately', () => {
      service.update('EngineSpeed', { width: 16 });
      expect(service.get('EngineSpeed')?.width).toBe(16);
    });

    it('should throw for non-existent signal', () => {
      expect(() => service.update('NonExistent', { width: 8 })).toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should stage signal deletion with _action=delete', () => {
      const change = service.delete('EngineSpeed');

      expect(change._action).toBe('delete');
      expect(change.data.name).toBe('EngineSpeed');
      expect(service.getPendingChanges()).toHaveLength(1);
    });

    it('should remove signal from cache immediately', () => {
      service.delete('EngineSpeed');
      expect(service.get('EngineSpeed')).toBeUndefined();
      expect(service.list()).toHaveLength(1);
    });

    it('should throw for non-existent signal', () => {
      expect(() => service.delete('NonExistent')).toThrow('not found');
    });

    // cancelDelete relies on originalCache to restore the pre-deletion snapshot.
    it('should cancel staged deletion and restore signal to cache', () => {
      service.delete('EngineSpeed');
      expect(service.get('EngineSpeed')).toBeUndefined();

      const restored = service.cancelDelete('EngineSpeed');
      expect(restored).toBe(true);
      expect(service.get('EngineSpeed')).toBeDefined();
      expect(service.get('EngineSpeed')?.width).toBe(8);
      expect(service.getPendingChanges()).toHaveLength(0);
    });

    it('should return false when canceling non-staged deletion', () => {
      expect(service.cancelDelete('EngineSpeed')).toBe(false);
    });
  });

  describe('commit', () => {
    it('should send pending changes to bridge and clear them', async () => {
      service.create({ name: 'NewSignal', width: 4, init_value: 5 });
      service.update('EngineSpeed', { init_value: 10 });

      await service.commit();

      expect(mockBridge.saveFile).toHaveBeenCalledTimes(1);
      const sentChanges = mockBridge.saveFile.mock.calls[0][1].signals as LdfChange<LdfSignal>[];
      expect(sentChanges).toHaveLength(2);
      expect(service.getPendingChanges()).toHaveLength(0);
    });

    // Strategy C: after commit cache already holds the correct state; no re-parse required.
    it('should reflect committed changes in subsequent queries without re-parsing', async () => {
      service.create({ name: 'NewSignal', width: 4, init_value: 5 });
      await service.commit();

      expect(service.get('NewSignal')).toBeDefined();
      expect(service.list()).toHaveLength(3);
      expect(mockBridge.saveFile).toHaveBeenCalledTimes(1);
    });
  });

  // applyChanges is the entry point for WebView saveChanges payload.
  describe('applyChanges', () => {
    it('should apply create change for new signal', () => {
      service.applyChanges([
        { _action: 'create', data: { name: 'AppliedSig', width: 8, init_value: 0 } },
      ]);
      expect(service.get('AppliedSig')).toBeDefined();
      expect(service.getPendingChanges()[0]._action).toBe('create');
    });

    it('should apply update change for existing signal', () => {
      service.applyChanges([
        { _action: 'update', data: { name: 'EngineSpeed', width: 16, init_value: 0 } },
      ]);
      expect(service.get('EngineSpeed')?.width).toBe(16);
      expect(service.getPendingChanges()[0]._action).toBe('update');
    });

    it('should apply delete change', () => {
      service.applyChanges([
        { _action: 'delete', data: { name: 'EngineSpeed', width: 8, init_value: 0 } },
      ]);
      expect(service.get('EngineSpeed')).toBeUndefined();
      expect(service.getPendingChanges()[0]._action).toBe('delete');
    });

    // If WebView sends "create" for an already-persisted signal, upgrade to update
    // so Python bridge never receives an invalid create operation.
    it('should convert create to update for existing signal', () => {
      service.applyChanges([
        { _action: 'create', data: { name: 'EngineSpeed', width: 32, init_value: 99 } },
      ]);
      expect(service.get('EngineSpeed')?.width).toBe(32);
      expect(service.getPendingChanges()[0]._action).toBe('update');
    });
  });
});
