import { vi, describe, it, expect } from 'vitest';
import { LdfService } from '../../src/service/ldfService';
import type { LdfSignal, LdfFrame } from '../../src/service/types';

// Covers FR-05: Save & Refresh (PRD §3). Verifies aggregate commit order and pending-change discard.
// Full workflow coverage lives in integration tests; this file tests the aggregate contract only.

describe('LdfService', () => {
  const mockParsedData = {
    protocol_version: '2.1',
    signals: [
      { name: 'Sig1', width: 8, init_value: 0 },
    ] as LdfSignal[],
    frames: [
      { name: 'Frame1', frame_id: 10, length: 8, signals: [] },
    ] as LdfFrame[],
  };

  it('should open file and initialize services', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');

    expect(mockBridge.parseFile).toHaveBeenCalledWith('/test.ldf');
    expect(service.signalService.list()).toHaveLength(1);
    expect(service.frameService.list()).toHaveLength(1);
  });

  it('should save both signal and frame changes', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    service.signalService.create({ name: 'NewSig', width: 4, init_value: 0 });
    service.frameService.create({ name: 'NewFrame', frame_id: 20, length: 2, signals: [] });

    await service.save();

    // save() delegates to signalService.commit() then frameService.commit().
    expect(mockBridge.saveFile).toHaveBeenCalledTimes(2);
  });

  it('should refresh and discard pending changes', async () => {
    const refreshedData = {
      protocol_version: '2.1',
      signals: [{ name: 'RefreshedSig', width: 16, init_value: 100 }],
      frames: [],
    };

    const mockBridge = {
      parseFile: vi
        .fn()
        .mockResolvedValueOnce(mockParsedData)
        .mockResolvedValueOnce(refreshedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    service.signalService.create({ name: 'PendingSig', width: 4, init_value: 0 });

    expect(service.signalService.getPendingChanges()).toHaveLength(1);

    // refresh() rebuilds both services from disk, dropping any uncommitted changes.
    await service.refresh();

    expect(mockBridge.parseFile).toHaveBeenCalledTimes(2);
    expect(service.signalService.list()).toHaveLength(1);
    expect(service.signalService.get('RefreshedSig')).toBeDefined();
    expect(service.signalService.getPendingChanges()).toHaveLength(0);
  });
});
