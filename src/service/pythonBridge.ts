import { spawn } from 'child_process';
import * as fs from 'fs';

/** Spawns the Python bridge and exchanges single-line JSON messages.
 *  Prefers a bundled exe if present; falls back to the configured Python interpreter.
 *  All Python stdout is collected into one buffer, then parsed as JSON.
 */
export class PythonBridge {
  constructor(
    private pythonPath: string = 'python',
    private scriptPath: string = './python/parse_ldf.py',
    private exePath?: string
  ) {}

  async parseFile(path: string): Promise<any> {
    const result = await this._sendCommand({
      command: 'parse',
      args: { path }
    });
    return result.data;
  }

  async saveFile(
    path: string,
    data: { signals: any[]; frames: any[] }
  ): Promise<void> {
    await this._sendCommand({
      command: 'save',
      args: { path, data }
    });
  }

  /** Spawns the Python child process, waits for stdout + close event.
   *  Error handling order matters:
   *  1. Parse stdout JSON first — Python may emit { status: 'error', ... } even with exit code 1.
   *  2. If JSON status is 'error', throw the message from Python.
   *  3. Only then check non-zero exit code (covers process crashes / stderr output).
   */
  private _sendCommand(cmd: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const useExe = this.exePath && fs.existsSync(this.exePath);
      const child = useExe
        ? spawn(this.exePath!, [JSON.stringify(cmd)])
        : spawn(this.pythonPath, [this.scriptPath, JSON.stringify(cmd)]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.status === 'error') {
            reject(new Error(parsed.message));
            return;
          }
          if (code !== 0) {
            reject(new Error(stderr || `Python process exited with code ${code}`));
            return;
          }
          resolve(parsed);
        } catch (err) {
          if (code !== 0) {
            reject(new Error(stderr || `Python process exited with code ${code}`));
            return;
          }
          reject(new Error(`Invalid JSON from Python: ${stdout}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
