import * as vscode from 'vscode';
import * as path from 'path';
import { get } from 'https';
import { createWriteStream, promises as fs } from 'fs';
import {
  ASSET_NAME,
  GitHubRelease,
  ReleaseAsset,
  findVsixAsset,
  getLocalVersion,
  isNewerVersion,
} from './updaterHelpers';

const RELEASE_API_URL = 'https://api.github.com/repos/notdog1998/FV_LDF_Parser/releases/latest';
const IGNORED_VERSION_KEY = 'ldfExplorer.ignoredUpdateVersion';

function getOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel('LDF Explorer');
}

function log(outputChannel: vscode.OutputChannel, message: string): void {
  outputChannel.appendLine(`[Updater] ${message}`);
}

function requestJson<T>(url: string, token: string | undefined, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `vscode-ldf-explorer/${getLocalVersion()}`,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error('Failed to parse GitHub API response'));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API request timed out'));
    });
  });
}

async function downloadAsset(
  url: string,
  destPath: string,
  token: string | undefined,
  redirectCount = 0
): Promise<void> {
  if (redirectCount > 5) {
    throw new Error('Too many download redirects');
  }

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': `vscode-ldf-explorer/${getLocalVersion()}`,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = get(url, { headers, timeout: 30000 }, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        resolve(downloadAsset(res.headers.location, destPath, token, redirectCount + 1));
        return;
      }

      if (statusCode !== 200) {
        reject(new Error(`Download returned ${statusCode}`));
        return;
      }

      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
      file.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

async function cleanOldDownloads(dir: string): Promise<void> {
  const entries = await fs.readdir(dir);
  await Promise.all(
    entries
      .filter((f) => f.endsWith('.vsix'))
      .map((f) => fs.unlink(path.join(dir, f)).catch(() => undefined))
  );
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch {
    // directory may already exist
  }
}

function handleError(
  outputChannel: vscode.OutputChannel,
  err: unknown,
  silent: boolean,
  prefix: string
): void {
  const message = err instanceof Error ? err.message : String(err);
  log(outputChannel, `${prefix}: ${message}`);
  if (!silent) {
    vscode.window.showErrorMessage(`${prefix}: ${message}`);
  }
}

async function performUpdate(
  release: GitHubRelease,
  context: vscode.ExtensionContext,
  token: string | undefined,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const asset = findVsixAsset(release.assets);
  if (!asset) {
    vscode.window.showErrorMessage('No .vsix asset found in the latest release.');
    return;
  }

  const downloadDir = vscode.Uri.joinPath(context.globalStorageUri, 'updates');
  await ensureDir(downloadDir);
  await cleanOldDownloads(downloadDir.fsPath);

  const vsixPath = path.join(downloadDir.fsPath, asset.name);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading LDF Explorer ${release.tag_name}...`,
      cancellable: false,
    },
    async () => {
      await downloadAsset(asset.browser_download_url, vsixPath, token);
    }
  );

  await vscode.commands.executeCommand(
    'workbench.extensions.action.installVSIX',
    vscode.Uri.file(vsixPath)
  );

  const reload = await vscode.window.showInformationMessage(
    'Update complete. Reload the window to apply changes.',
    'Reload Window'
  );
  if (reload === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export async function checkUpdate(
  context: vscode.ExtensionContext,
  options: { silent: boolean }
): Promise<void> {
  const outputChannel = getOutputChannel();
  context.subscriptions.push(outputChannel);

  try {
    const config = vscode.workspace.getConfiguration('ldfExplorer');
    if (options.silent && config.get<boolean>('autoCheckUpdate') === false) {
      return;
    }

    const token = config.get<string>('githubToken') || undefined;
    const localVersion = getLocalVersion();

    let release: GitHubRelease;
    try {
      release = await requestJson<GitHubRelease>(RELEASE_API_URL, token, 10000);
    } catch (err) {
      handleError(outputChannel, err, options.silent, 'Failed to check for updates');
      return;
    }

    const remoteVersion = release.tag_name;
    if (!isNewerVersion(remoteVersion, localVersion)) {
      log(outputChannel, `No update available (local: ${localVersion}, remote: ${remoteVersion})`);
      if (!options.silent) {
        vscode.window.showInformationMessage('LDF Explorer is up to date.');
      }
      return;
    }

    const ignoredVersion = context.globalState.get<string>(IGNORED_VERSION_KEY);
    if (ignoredVersion === remoteVersion) {
      log(outputChannel, `Version ${remoteVersion} was ignored by user`);
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `A new version of LDF Explorer is available: ${remoteVersion}`,
      'Update Now',
      'View Release Notes',
      'Ignore This Version'
    );

    if (choice === 'Update Now') {
      await performUpdate(release, context, token, outputChannel);
    } else if (choice === 'View Release Notes') {
      await vscode.env.openExternal(vscode.Uri.parse(release.html_url));
    } else if (choice === 'Ignore This Version') {
      await context.globalState.update(IGNORED_VERSION_KEY, remoteVersion);
    }
  } catch (err) {
    handleError(outputChannel, err, options.silent, 'Unexpected error while checking for updates');
  }
}
