import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runCli, parseArgs, helpText } from '../../src/cli/index';
import type { LdfSignal, LdfFrame } from '../../src/service/types';

// Covers FR-06: CLI parse / info / signals / frames / validate (PRD §3, §6).
// PythonBridge is injected as a mock so unit tests never spawn a real Python process.

describe('CLI', () => {
  let mockBridge: { parseFile: ReturnType<typeof vi.fn>; saveFile: ReturnType<typeof vi.fn> };

  const sampleData = {
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
          product_id: { supplier_id: 0x1234, function_id: 0xabcd, variant: 1 },
        },
      ],
    },
    signals: [
      {
        name: 'EngineSpeed',
        width: 8,
        init_value: 0,
        publisher: 'MasterNode',
        subscribers: ['Slave1'],
      },
    ] as LdfSignal[],
    frames: [
      {
        name: 'EngineFrame',
        frame_id: 10,
        length: 8,
        publisher: 'MasterNode',
        signals: [{ signal: 'EngineSpeed', offset: 0 }],
      },
    ] as LdfFrame[],
  };

  beforeEach(() => {
    mockBridge = {
      parseFile: vi.fn().mockResolvedValue(sampleData),
      saveFile: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('parseArgs', () => {
    it('should extract command and file', () => {
      const args = parseArgs(['parse', '/file.ldf']);
      expect(args.command).toBe('parse');
      expect(args.file).toBe('/file.ldf');
      expect(args.json).toBe(false);
      expect(args.help).toBe(false);
    });

    it('should detect --json flag in any position', () => {
      const args = parseArgs(['info', '--json', '/file.ldf']);
      expect(args.command).toBe('info');
      expect(args.file).toBe('/file.ldf');
      expect(args.json).toBe(true);
    });

    it('should detect -h / --help flag', () => {
      expect(parseArgs(['--help']).help).toBe(true);
      expect(parseArgs(['-h']).help).toBe(true);
    });
  });

  describe('help / unknown command', () => {
    it('should print help and exit 0 when --help is passed', async () => {
      const result = await runCli(['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: ldf-explorer');
      expect(result.stdout).toContain('parse');
      expect(result.stdout).toContain('validate');
    });

    it('should exit 1 with help when no command given', async () => {
      const result = await runCli([]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Usage: ldf-explorer');
    });

    it('should exit 1 for unknown command', async () => {
      const result = await runCli(['unknown', '/file.ldf']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: unknown');
    });

    it('should exit 1 when file path is missing', async () => {
      const result = await runCli(['parse']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing <file.ldf>');
    });
  });

  describe('parse', () => {
    it('should print full JSON payload', async () => {
      const result = await runCli(['parse', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.overview.protocol_version).toBe('2.1');
      expect(parsed.signals).toHaveLength(1);
      expect(parsed.frames).toHaveLength(1);
      expect(parsed.nodes.master.name).toBe('MasterNode');
    });

    it('should propagate parse errors as exit 1', async () => {
      mockBridge.parseFile.mockRejectedValueOnce(new Error('Bad LDF'));

      const result = await runCli(['parse', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Bad LDF');
    });
  });

  describe('info', () => {
    it('should render overview as a table by default', async () => {
      const result = await runCli(['info', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Protocol Version');
      expect(result.stdout).toContain('2.1');
      expect(result.stdout).toContain('Master');
      expect(result.stdout).toContain('MasterNode');
      expect(result.stdout).toContain('Slave1');
    });

    it('should render overview as JSON when --json passed', async () => {
      const result = await runCli(['info', '/file.ldf', '--json'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.overview.baudrate).toBe(19200);
      expect(parsed.nodes.slaves[0].product_id.variant).toBe(1);
    });

    it('should render "(none)" when LDF has no master', async () => {
      mockBridge.parseFile.mockResolvedValueOnce({
        ...sampleData,
        nodes: { master: undefined, slaves: [{ name: 'OnlySlave' }] },
      });

      const result = await runCli(['info', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Master');
      expect(result.stdout).toContain('(none)');
      // Slaves still listed even when product_id is missing.
      expect(result.stdout).toContain('OnlySlave');
      expect(result.stdout).toContain('product_id=[-]');
    });
  });

  describe('signals', () => {
    it('should list signals as a table', async () => {
      const result = await runCli(['signals', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Name');
      expect(result.stdout).toContain('EngineSpeed');
      expect(result.stdout).toContain('MasterNode');
      expect(result.stdout).toContain('Slave1');
    });

    it('should list signals as JSON when --json passed', async () => {
      const result = await runCli(['signals', '--json', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('EngineSpeed');
    });

    it('should print empty marker when no signals', async () => {
      mockBridge.parseFile.mockResolvedValueOnce({
        ...sampleData,
        signals: [],
      });

      const result = await runCli(['signals', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('(no signals)');
    });
  });

  describe('frames', () => {
    it('should list frames as a table including signal mappings', async () => {
      const result = await runCli(['frames', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('EngineFrame');
      expect(result.stdout).toContain('10'); // frame_id
      expect(result.stdout).toContain('0:EngineSpeed');
    });

    it('should list frames as JSON when --json passed', async () => {
      const result = await runCli(['frames', '/file.ldf', '--json'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].frame_id).toBe(10);
      expect(parsed[0].signals[0].offset).toBe(0);
    });

    it('should print empty marker when no frames', async () => {
      mockBridge.parseFile.mockResolvedValueOnce({
        ...sampleData,
        frames: [],
      });

      const result = await runCli(['frames', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.stdout).toContain('(no frames)');
    });
  });

  describe('validate', () => {
    // validate exits 0 only when the bridge parses without throwing.
    it('should exit 0 when file parses successfully', async () => {
      const result = await runCli(['validate', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OK');
      expect(result.stdout).toContain('/file.ldf');
    });

    it('should exit 1 when parse fails', async () => {
      mockBridge.parseFile.mockRejectedValueOnce(new Error('Syntax error at line 10'));

      const result = await runCli(['validate', '/file.ldf'], {
        bridgeFactory: () => mockBridge as any,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('INVALID');
      expect(result.stderr).toContain('Syntax error at line 10');
    });
  });

  describe('helpText', () => {
    it('should mention all commands', () => {
      const text = helpText();
      expect(text).toContain('parse');
      expect(text).toContain('info');
      expect(text).toContain('signals');
      expect(text).toContain('frames');
      expect(text).toContain('validate');
    });
  });
});
