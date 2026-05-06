// Covers Service Layer ↔ Python Bridge communication protocol (PRD §5).
// Validates JSON command format, stdout parsing, and error handling order.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process so unit tests never spawn a real Python process.
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock fs to control whether the bundled exe exists.
vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { PythonBridge } from '../../src/service/pythonBridge';

describe('PythonBridge', () => {
  let bridge: PythonBridge;
  const mockSpawn = vi.mocked(spawn);
  const mockExistsSync = vi.mocked(existsSync);
  const scriptPath = '/absolute/path/to/parse_ldf.py';
  const exePath = '/absolute/path/to/bin/ldfparser-bridge.exe';

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new PythonBridge('python', scriptPath);
  });

  /** Emits stdout JSON and close event on the next tick, mimicking real spawn behavior. */
  function mockSpawnResponse(stdoutData: object, exitCode: number = 0, stderrData?: string) {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess);

    process.nextTick(() => {
      if (stderrData) {
        mockProcess.stderr.emit('data', Buffer.from(stderrData));
      }
      mockProcess.stdout.emit('data', Buffer.from(JSON.stringify(stdoutData)));
      mockProcess.emit('close', exitCode);
    });

    return mockProcess;
  }

  describe('parseFile', () => {
    it('should return parsed LDF data when Python responds with ok', async () => {
      const ldfData = {
        protocol_version: '2.1',
        signals: [{ name: 'EngineSpeed', width: 8, init_value: 0 }]
      };
      mockSpawnResponse({ status: 'ok', data: ldfData });

      const result = await bridge.parseFile('/path/to/file.ldf');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn.mock.calls[0][0]).toBe('python');

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs[0]).toBe(scriptPath);

      const jsonCmd = JSON.parse(spawnArgs[1]);
      expect(jsonCmd.command).toBe('parse');
      expect(jsonCmd.args.path).toBe('/path/to/file.ldf');

      expect(result).toEqual(ldfData);
    });

    // Python may emit {status:'error'} with exit code 1; we prefer the structured message.
    it('should throw error when Python responds with error status', async () => {
      mockSpawnResponse({ status: 'error', message: 'File not found', traceback: '...' }, 1);

      await expect(bridge.parseFile('/missing.ldf')).rejects.toThrow('File not found');
    });

    // Covers the case where Python crashes before writing valid JSON.
    it('should throw error when process exits with non-zero code', async () => {
      mockSpawnResponse({}, 1, 'Python crashed unexpectedly');

      await expect(bridge.parseFile('/any.ldf')).rejects.toThrow();
    });
  });

  describe('saveFile', () => {
    it('should send save command with signal and frame changes', async () => {
      mockSpawnResponse({ status: 'ok', message: 'Saved successfully' });

      const changes = {
        signals: [{ _action: 'create' as const, data: { name: 'NewSignal', width: 8, init_value: 0 } }],
        frames: []
      };

      await bridge.saveFile('/path/to/file.ldf', changes);

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      const jsonCmd = JSON.parse(spawnArgs[1]);

      expect(jsonCmd.command).toBe('save');
      expect(jsonCmd.args.path).toBe('/path/to/file.ldf');
      expect(jsonCmd.args.data.signals).toEqual(changes.signals);
      expect(jsonCmd.args.data.frames).toEqual(changes.frames);
    });

    it('should throw error when save responds with error status', async () => {
      mockSpawnResponse({ status: 'error', message: 'Failed to save LDF' }, 1);

      const changes = { signals: [], frames: [] };
      await expect(bridge.saveFile('/any.ldf', changes)).rejects.toThrow('Failed to save LDF');
    });
  });

  describe('bundled exe fallback', () => {
    it('should use bundled exe when exePath exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const ldfData = { protocol_version: '2.1', signals: [] };
      mockSpawnResponse({ status: 'ok', data: ldfData });

      const exeBridge = new PythonBridge('python', scriptPath, exePath);
      await exeBridge.parseFile('/path/to/file.ldf');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn.mock.calls[0][0]).toBe(exePath);
      // exe mode: only one arg (the JSON command)
      expect((mockSpawn.mock.calls[0][1] as string[]).length).toBe(1);
      const jsonCmd = JSON.parse((mockSpawn.mock.calls[0][1] as string[])[0]);
      expect(jsonCmd.command).toBe('parse');
    });

    it('should fallback to python interpreter when exePath does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const ldfData = { protocol_version: '2.1', signals: [] };
      mockSpawnResponse({ status: 'ok', data: ldfData });

      const exeBridge = new PythonBridge('python', scriptPath, exePath);
      await exeBridge.parseFile('/path/to/file.ldf');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn.mock.calls[0][0]).toBe('python');
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs[0]).toBe(scriptPath);
    });

    it('should use python interpreter when no exePath is provided', async () => {
      mockExistsSync.mockReturnValue(false);
      const ldfData = { protocol_version: '2.1', signals: [] };
      mockSpawnResponse({ status: 'ok', data: ldfData });

      // bridge created in beforeEach has no exePath
      await bridge.parseFile('/path/to/file.ldf');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn.mock.calls[0][0]).toBe('python');
    });
  });
});
