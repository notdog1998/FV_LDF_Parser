#!/usr/bin/env node
import * as path from 'path';
import { PythonBridge } from '../service/pythonBridge';
import { LdfService } from '../service/ldfService';
import type { LdfSignal, LdfFrame, LdfMaster, LdfSlave } from '../service/types';

/** Parsed CLI arguments. */
export interface CliArgs {
  command?: string;
  file?: string;
  json: boolean;
  help: boolean;
}

/** Outcome of a CLI invocation. exitCode + captured stdout/stderr so callers (and tests) can inspect both. */
export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Dependency seam: tests inject a mocked bridge so no Python process is spawned. */
export interface CliDependencies {
  bridgeFactory: () => PythonBridge;
}

const COMMANDS = ['parse', 'info', 'signals', 'frames', 'validate'] as const;
type Command = (typeof COMMANDS)[number];

export async function runCli(
  argv: string[],
  deps?: Partial<CliDependencies>
): Promise<CliResult> {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    return { exitCode: args.help ? 0 : 1, stdout: args.help ? helpText() : '', stderr: args.help ? '' : helpText() };
  }
  if (!COMMANDS.includes(args.command as Command)) {
    return { exitCode: 1, stdout: '', stderr: `Unknown command: ${args.command}\n${helpText()}` };
  }
  if (!args.file) {
    return { exitCode: 1, stdout: '', stderr: `Missing <file.ldf> argument for "${args.command}"\n${helpText()}` };
  }

  const bridge = (deps?.bridgeFactory ?? defaultBridgeFactory)();

  try {
    switch (args.command as Command) {
      case 'parse':
        return await handleParse(bridge, args.file);
      case 'info':
        return await handleInfo(bridge, args.file, args.json);
      case 'signals':
        return await handleSignals(bridge, args.file, args.json);
      case 'frames':
        return await handleFrames(bridge, args.file, args.json);
      case 'validate':
        return await handleValidate(bridge, args.file);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: '', stderr: `Error: ${message}\n` };
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false, help: false };
  for (const token of argv) {
    if (token === '--json') {
      args.json = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (!args.command) {
      args.command = token;
    } else if (!args.file) {
      args.file = token;
    }
  }
  return args;
}

export function helpText(): string {
  return [
    'Usage: ldf-explorer <command> <file.ldf> [--json]',
    '',
    'Commands:',
    '  parse      Parse LDF and print full JSON',
    '  info       Print header overview (table or --json)',
    '  signals    List signals (table or --json)',
    '  frames     List frames and signal mappings (table or --json)',
    '  validate   Validate LDF format; exits 0 on success, 1 on failure',
    '',
    'Options:',
    '  --json     Output JSON instead of a human-readable table',
    '  -h, --help Show this help text',
    '',
  ].join('\n');
}

/** Default bridge wires up paths relative to the compiled CLI script. */
function defaultBridgeFactory(): PythonBridge {
  const pythonPath = process.env.LDF_EXPLORER_PYTHON || 'python';
  const projectRoot = path.resolve(__dirname, '..', '..');
  const scriptPath = path.join(projectRoot, 'python', 'parse_ldf.py');
  const exePath = path.join(projectRoot, 'bin', 'ldfparser-bridge.exe');
  return new PythonBridge(pythonPath, scriptPath, exePath);
}

async function handleParse(bridge: PythonBridge, filePath: string): Promise<CliResult> {
  const service = await LdfService.open(bridge, filePath);
  const payload = {
    overview: service.getOverview(),
    nodes: service.getNodes(),
    signals: service.signalService.list(),
    frames: service.frameService.list(),
  };
  return { exitCode: 0, stdout: JSON.stringify(payload, null, 2) + '\n', stderr: '' };
}

async function handleInfo(
  bridge: PythonBridge,
  filePath: string,
  json: boolean
): Promise<CliResult> {
  const service = await LdfService.open(bridge, filePath);
  const overview = service.getOverview();
  const nodes = service.getNodes();

  if (json) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ overview, nodes }, null, 2) + '\n',
      stderr: '',
    };
  }

  return {
    exitCode: 0,
    stdout: formatInfoTable(overview, nodes.master, nodes.slaves),
    stderr: '',
  };
}

async function handleSignals(
  bridge: PythonBridge,
  filePath: string,
  json: boolean
): Promise<CliResult> {
  const service = await LdfService.open(bridge, filePath);
  const signals = service.signalService.list();

  if (json) {
    return { exitCode: 0, stdout: JSON.stringify(signals, null, 2) + '\n', stderr: '' };
  }
  return { exitCode: 0, stdout: formatSignalsTable(signals), stderr: '' };
}

async function handleFrames(
  bridge: PythonBridge,
  filePath: string,
  json: boolean
): Promise<CliResult> {
  const service = await LdfService.open(bridge, filePath);
  const frames = service.frameService.list();

  if (json) {
    return { exitCode: 0, stdout: JSON.stringify(frames, null, 2) + '\n', stderr: '' };
  }
  return { exitCode: 0, stdout: formatFramesTable(frames), stderr: '' };
}

/** validate succeeds (exit 0) only when the bridge parses without throwing. */
async function handleValidate(bridge: PythonBridge, filePath: string): Promise<CliResult> {
  try {
    await LdfService.open(bridge, filePath);
    return { exitCode: 0, stdout: `OK: ${filePath} is valid\n`, stderr: '' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: '', stderr: `INVALID: ${filePath}\n${message}\n` };
  }
}

function formatInfoTable(
  overview: ReturnType<LdfService['getOverview']>,
  master: LdfMaster | undefined,
  slaves: LdfSlave[]
): string {
  const lines: string[] = [];
  lines.push('Overview');
  lines.push(`  Protocol Version : ${overview.protocol_version || '-'}`);
  lines.push(`  Language Version : ${overview.language_version || '-'}`);
  lines.push(`  Baudrate         : ${overview.baudrate || '-'}`);
  lines.push(`  Channel          : ${overview.channel ?? '-'}`);
  lines.push(`  Checksum Model   : ${overview.checksum_model ?? '-'}`);
  lines.push('');
  lines.push('Master');
  if (master) {
    lines.push(`  Name     : ${master.name}`);
    lines.push(`  Timebase : ${master.timebase}`);
    lines.push(`  Jitter   : ${master.jitter}`);
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push(`Slaves (${slaves.length})`);
  for (const slave of slaves) {
    const productId = slave.product_id
      ? `supplier=0x${slave.product_id.supplier_id.toString(16)}, function=0x${slave.product_id.function_id.toString(16)}, variant=${slave.product_id.variant}`
      : '-';
    lines.push(`  - ${slave.name}  product_id=[${productId}]`);
  }
  return lines.join('\n') + '\n';
}

function formatSignalsTable(signals: LdfSignal[]): string {
  if (signals.length === 0) return '(no signals)\n';
  const header = ['Name', 'Width', 'Init', 'Publisher', 'Subscribers'];
  const rows = signals.map((s) => [
    s.name,
    String(s.width),
    String(s.init_value),
    s.publisher ?? '-',
    s.subscribers && s.subscribers.length > 0 ? s.subscribers.join(',') : '-',
  ]);
  return renderTable(header, rows);
}

function formatFramesTable(frames: LdfFrame[]): string {
  if (frames.length === 0) return '(no frames)\n';
  const header = ['Name', 'ID', 'Length', 'Publisher', 'Signals (offset:name)'];
  const rows = frames.map((f) => [
    f.name,
    String(f.frame_id),
    String(f.length),
    f.publisher ?? '-',
    f.signals.length > 0
      ? f.signals.map((m) => `${m.offset}:${m.signal}`).join(',')
      : '-',
  ]);
  return renderTable(header, rows);
}

function renderTable(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  const lines = [fmt(header), widths.map((w) => '-'.repeat(w)).join('  ')];
  for (const row of rows) lines.push(fmt(row));
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}
