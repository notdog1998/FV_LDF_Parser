import { vi, describe, it, expect } from 'vitest';
import { LdfService } from '../../src/service/ldfService';
import type { LdfSignal, LdfFrame } from '../../src/service/types';

// Covers FR-02 (overview + nodes exposure) and FR-05 (save & refresh) at the aggregate layer (PRD §3, §6).
// Full workflow coverage lives in integration tests; this file tests the aggregate contract only.

describe('LdfService', () => {
  const mockParsedData = {
    overview: {
      protocol_version: '2.1',
      language_version: '2.1',
      baudrate: 19200,
      channel: 'DB1',
      checksum_model: 'enhanced' as const,
    },
    nodes: {
      master: { name: 'MasterNode', timebase: 0.005, jitter: 0.0001 },
      slaves: [
        {
          name: 'Slave1',
          product_id: { supplier_id: 1, function_id: 2, variant: 0 },
          configured_nad: 0x60,
        },
      ],
    },
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

  it('should expose overview metadata from parsed data', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const overview = service.getOverview();

    expect(overview.protocol_version).toBe('2.1');
    expect(overview.language_version).toBe('2.1');
    expect(overview.baudrate).toBe(19200);
    expect(overview.channel).toBe('DB1');
    expect(overview.checksum_model).toBe('enhanced');
  });

  // Defensive copy: mutating the returned overview should not corrupt internal state.
  it('should return a defensive copy of overview', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const overview = service.getOverview();
    overview.baudrate = 9999;

    expect(service.getOverview().baudrate).toBe(19200);
  });

  it('should normalize missing overview fields without throwing', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue({ signals: [], frames: [] }),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const overview = service.getOverview();

    expect(overview.protocol_version).toBe('');
    expect(overview.language_version).toBe('');
    expect(overview.baudrate).toBe(0);
    expect(overview.channel).toBeUndefined();
    expect(overview.checksum_model).toBeUndefined();
  });

  it('should expose master and slave nodes from parsed data', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const nodes = service.getNodes();

    expect(nodes.master?.name).toBe('MasterNode');
    expect(nodes.master?.timebase).toBe(0.005);
    expect(nodes.slaves).toHaveLength(1);
    expect(nodes.slaves[0].name).toBe('Slave1');
    expect(nodes.slaves[0].product_id?.supplier_id).toBe(1);
    expect(nodes.slaves[0].configured_nad).toBe(0x60);
  });

  // Defensive copy: nested product_id objects must also be cloned.
  it('should return defensive copies of nested slave product_id', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue(mockParsedData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const nodes = service.getNodes();
    nodes.slaves[0].product_id!.supplier_id = 999;

    expect(service.getNodes().slaves[0].product_id?.supplier_id).toBe(1);
  });

  it('should return empty slaves array when nodes section is missing', async () => {
    const mockBridge = {
      parseFile: vi.fn().mockResolvedValue({ signals: [], frames: [] }),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };

    const service = await LdfService.open(mockBridge as any, '/test.ldf');
    const nodes = service.getNodes();

    expect(nodes.master).toBeUndefined();
    expect(nodes.slaves).toEqual([]);
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
      overview: {
        protocol_version: '2.2',
        language_version: '2.2',
        baudrate: 9600,
      },
      nodes: { master: { name: 'NewMaster', timebase: 0.01, jitter: 0.0005 }, slaves: [] },
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

    await service.refresh();

    expect(mockBridge.parseFile).toHaveBeenCalledTimes(2);
    expect(service.signalService.list()).toHaveLength(1);
    expect(service.signalService.get('RefreshedSig')).toBeDefined();
    expect(service.signalService.getPendingChanges()).toHaveLength(0);
    // Header & nodes are re-populated from the new parse.
    expect(service.getOverview().protocol_version).toBe('2.2');
    expect(service.getNodes().master?.name).toBe('NewMaster');
  });
});
