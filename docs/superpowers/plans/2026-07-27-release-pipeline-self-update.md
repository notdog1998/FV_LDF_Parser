# Release Pipeline & Self-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions release pipeline that builds and publishes a fixed-name `.vsix` asset on tag pushes to the `release` branch, and add an in-extension self-updater that checks GitHub Releases, downloads, and installs updates.

**Architecture:** A new `src/updater.ts` module encapsulates all GitHub API interaction, semver comparison, download, install, and user prompts; `src/extension.ts` activates it asynchronously. The release side is a single `.github/workflows/release.yml` workflow plus `.vscodeignore` and README updates.

**Tech Stack:** TypeScript, VS Code Extension API, Node.js `https`, `semver`, `vsce`, GitHub Actions, vitest.

## Global Constraints

- Extension ID prefix for settings/commands: `ldfExplorer`
- GitHub repository: `notdog1998/FV_LDF_Parser`, public
- Release asset filename: `fv-ldf-explorer.vsix`
- Tag format: `v*.*.*`
- Release branch: `release` (long-lived, clean release state)
- Build commands: `npm run compile`, `npm run build:webview`
- Package command: `vsce package`
- Runtime dependencies must be bundled into the `.vsix`
- No modifications to `python/ldfparser/`
- Update checks must not block activation or throw uncaught exceptions
- Update prompts and messages in English

## File Structure

- `.github/workflows/release.yml` — new GitHub Actions workflow
- `.vscodeignore` — updated to keep runtime deps, exclude dev artifacts
- `README.md` — add maintainer publishing section
- `package.json` — add `semver` dependency, new command, new configuration
- `src/updater.ts` — new updater module
- `src/extension.ts` — wire updater into `activate()`
- `tests/updater.test.ts` — new unit tests for pure helpers in updater

---

### Task 1: Create the `release` branch

**Files:**
- Branch: `release`

**Interfaces:**
- Consumes: `main`
- Produces: local `release` branch

- [ ] **Step 1: Create and checkout release branch from main**

Run:
```bash
git checkout -b release
```

Expected: `Switched to a new branch 'release'`

- [ ] **Step 2: Push release branch to origin**

Run:
```bash
git push -u origin release
```

Expected: branch created on remote.

- [ ] **Step 3: Return to main for implementation work**

Run:
```bash
git checkout main
```

---

### Task 2: Update `.vscodeignore` for clean vsix packaging

**Files:**
- Modify: `.vscodeignore`

**Interfaces:**
- Produces: smaller `.vsix` excluding dev-only files but keeping runtime deps and the bridge executable

- [ ] **Step 1: Replace `.vscodeignore` content**

```text
.vscode/**
.vscode-test/**
src/**
tsconfig.json
**/*.map
node_modules/@types/**
node_modules/vscode/**
node_modules/.bin/**
node_modules/*/test/**
node_modules/*/tests/**
node_modules/*/docs/**
node_modules/*/examples/**
node_modules/typescript/**
node_modules/vitest/**
node_modules/@vitest/**
node_modules/c8/**
node_modules/istanbul*/**

# WebView dev dependencies (production build lives in dist/webview)
webview/node_modules/**

# Python source no longer needed at runtime (bundled into exe)
python/**

# Keep the pre-built Windows bridge
!bin/ldfparser-bridge.exe
```

- [ ] **Step 2: Verify no runtime code is excluded**

Run:
```bash
npx vsce package --no-yarn -o /tmp/vscode-ldf-explorer-test.vsix
```

Expected: command succeeds and produces a `.vsix` file.

- [ ] **Step 3: Commit**

```bash
git add .vscodeignore
git commit -m "chore: clean up .vscodeignore for release packaging

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Add GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `package.json` version, pushed tag on `release` branch
- Produces: GitHub Release with asset `fv-ldf-explorer.vsix`

- [ ] **Step 1: Create workflow file**

```yaml
name: Release

on:
  push:
    branches:
      - release
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: |
          npm run compile
          npm run build:webview

      - name: Install vsce
        run: npm install -g vsce

      - name: Package extension
        run: vsce package

      - name: Verify tag matches package version
        shell: bash
        run: |
          TAG=${GITHUB_REF_NAME#v}
          VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG" != "$VERSION" ]; then
            echo "Tag version $TAG does not match package.json version $VERSION"
            exit 1
          fi

      - name: Rename vsix asset
        shell: bash
        run: |
          mv *.vsix fv-ldf-explorer.vsix

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: fv-ldf-explorer.vsix
          generate_release_notes: true
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```bash
npx yaml-lint .github/workflows/release.yml || echo "yaml-lint not installed, skipping"
```

If yaml-lint is not installed, visually confirm indentation is correct.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for vsix publishing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Update README with maintainer publishing instructions

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: documented release process for maintainers

- [ ] **Step 1: Insert new section before License**

Add this section at the end of `README.md`, before `## License`:

```markdown
## Publishing

Maintainers can publish a new release by following these steps:

1. **Update the version number** in `package.json` following [Semantic Versioning](https://semver.org/).
2. **Synchronize the release branch** with `main`:
   ```bash
   git checkout release
   git merge main
   git push origin release
   ```
3. **Tag and push the release**:
   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push origin tag v$(node -p "require('./package.json').version")
   ```
4. The [Release workflow](.github/workflows/release.yml) will automatically build the extension, package it as `fv-ldf-explorer.vsix`, create a GitHub Release, and attach the asset.

Users can install the latest release by downloading `fv-ldf-explorer.vsix` from the [Releases page](https://github.com/notdog1998/FV_LDF_Parser/releases) and running `Install from VSIX...` in VS Code.

## Automatic Updates

The extension can check for updates automatically. To disable automatic checks, set `ldfExplorer.autoCheckUpdate` to `false`. To check manually, run the command `LDF Explorer: Check for Updates` from the command palette.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add publishing and auto-update instructions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Add `semver` dependency

**Files:**
- Modify: `package.json`
- Create: `package-lock.json` (npm will update it)

**Interfaces:**
- Produces: `semver` available at runtime inside the extension

- [ ] **Step 1: Install semver**

Run:
```bash
npm install semver
```

Expected: `semver` is added to `dependencies` in `package.json` and `package-lock.json` is updated.

- [ ] **Step 2: Install @types/semver**

Run:
```bash
npm install --save-dev @types/semver
```

Expected: `@types/semver` is added to `devDependencies`.

- [ ] **Step 3: Verify TypeScript sees semver**

Run:
```bash
npm run compile
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add semver for version comparison

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Implement `src/updater.ts`

**Files:**
- Create: `src/updater.ts`

**Interfaces:**
- Consumes: `vscode.ExtensionContext`, `vscode.workspace.getConfiguration('ldfExplorer')`
- Produces:
  - `export async function checkUpdate(context: vscode.ExtensionContext, options: { silent: boolean }): Promise<void>`
  - `export function isNewerVersion(remote: string, local: string): boolean`
  - `export function findVsixAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined`

Types:
```typescript
interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}
```

- [ ] **Step 1: Write `src/updater.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as semver from 'semver';
import { get } from 'https';
import { createWriteStream, promises as fs } from 'fs';

const RELEASE_API_URL = 'https://api.github.com/repos/notdog1998/FV_LDF_Parser/releases/latest';
const IGNORED_VERSION_KEY = 'ldfExplorer.ignoredUpdateVersion';
const ASSET_NAME = 'fv-ldf-explorer.vsix';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

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
        } catch (err) {
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

export function getLocalVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../package.json').version as string;
}

export function isNewerVersion(remote: string, local: string): boolean {
  const remoteClean = remote.replace(/^v/, '');
  const localClean = local.replace(/^v/, '');
  const remoteSemver = semver.valid(remoteClean);
  const localSemver = semver.valid(localClean);
  if (!remoteSemver || !localSemver) {
    return false;
  }
  return semver.gt(remoteSemver, localSemver);
}

export function findVsixAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  return assets.find((a) => a.name === ASSET_NAME) ?? assets.find((a) => a.name.endsWith('.vsix'));
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
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadAsset(res.headers.location, destPath, token, redirectCount + 1));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download returned ${res.statusCode}`));
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
```

- [ ] **Step 2: Commit**

```bash
git add src/updater.ts
git commit -m "feat: add self-update module

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Wire updater into `src/extension.ts`

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `checkUpdate` from `src/updater.ts`
- Produces: automatic silent update check on activation, manual command registration

- [ ] **Step 1: Add import and activate update check**

At the top of `src/extension.ts`, add:

```typescript
import { checkUpdate } from './updater';
```

Inside `activate`, after registering `openLdf`, add:

```typescript
  // Kick off update check without blocking activation.
  checkUpdate(context, { silent: true }).catch(() => undefined);

  context.subscriptions.push(
    vscode.commands.registerCommand('ldfExplorer.checkUpdate', () =>
      checkUpdate(context, { silent: false })
    )
  );
```

The full `activate` function should look like:

```typescript
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ldfExplorer.openLdf', (uri: vscode.Uri) =>
      openLdfDocument(context, uri)
    )
  );

  // Kick off update check without blocking activation.
  checkUpdate(context, { silent: true }).catch(() => undefined);

  context.subscriptions.push(
    vscode.commands.registerCommand('ldfExplorer.checkUpdate', () =>
      checkUpdate(context, { silent: false })
    )
  );
}
```

- [ ] **Step 2: Compile**

Run:
```bash
npm run compile
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire update check into activation and command palette

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Update `package.json` commands and configuration

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `ldfExplorer.checkUpdate` command, `ldfExplorer.autoCheckUpdate` and `ldfExplorer.githubToken` settings

- [ ] **Step 1: Add command**

In `contributes.commands`, add after the existing `ldfExplorer.openLdf` entry:

```json
      {
        "command": "ldfExplorer.checkUpdate",
        "title": "Check for Updates",
        "category": "LDF Explorer"
      }
```

- [ ] **Step 2: Add command palette entry**

In `contributes.menus.commandPalette`, add:

```json
        {
          "command": "ldfExplorer.checkUpdate",
          "when": "true"
        }
```

- [ ] **Step 3: Add configuration properties**

In `contributes.configuration.properties`, add:

```json
        "ldfExplorer.autoCheckUpdate": {
          "type": "boolean",
          "default": true,
          "description": "Automatically check for updates when the extension activates."
        },
        "ldfExplorer.githubToken": {
          "type": "string",
          "default": "",
          "description": "GitHub Personal Access Token for accessing private release repositories. Not required for public repositories."
        }
```

- [ ] **Step 4: Compile**

Run:
```bash
npm run compile
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat: register update command and settings

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Add unit tests for updater helpers

**Files:**
- Create: `tests/updater.test.ts`

**Interfaces:**
- Consumes: `isNewerVersion`, `findVsixAsset`, `getLocalVersion` from `src/updater.ts`
- Produces: passing vitest tests

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { isNewerVersion, findVsixAsset, getLocalVersion } from '../src/updater';

describe('isNewerVersion', () => {
  it('returns true when remote is newer', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true);
  });

  it('returns false when remote is older or equal', () => {
    expect(isNewerVersion('v0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false for invalid versions', () => {
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false);
    expect(isNewerVersion('v1.0.0', 'bad')).toBe(false);
  });
});

describe('findVsixAsset', () => {
  it('prefers the fixed asset name', () => {
    const assets = [
      { name: 'source.zip', browser_download_url: 'https://example.com/source.zip' },
      { name: 'fv-ldf-explorer.vsix', browser_download_url: 'https://example.com/fv-ldf-explorer.vsix' },
    ];
    expect(findVsixAsset(assets)?.name).toBe('fv-ldf-explorer.vsix');
  });

  it('falls back to any .vsix asset', () => {
    const assets = [
      { name: 'source.zip', browser_download_url: 'https://example.com/source.zip' },
      { name: 'other.vsix', browser_download_url: 'https://example.com/other.vsix' },
    ];
    expect(findVsixAsset(assets)?.name).toBe('other.vsix');
  });

  it('returns undefined when no vsix exists', () => {
    expect(findVsixAsset([{ name: 'source.zip', browser_download_url: 'https://example.com/source.zip' }])).toBeUndefined();
  });
});

describe('getLocalVersion', () => {
  it('reads version from package.json', () => {
    const version = getLocalVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run tests**

Run:
```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/updater.test.ts
git commit -m "test: add updater helper unit tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Release branch creation: Task 1
- `.vscodeignore` cleanup: Task 2
- GitHub Actions workflow with version check and fixed asset name: Task 3
- README publishing instructions: Task 4
- `semver` dependency: Task 5
- Updater check/install/ignore logic: Task 6
- Activation wiring and manual command: Task 7
- Configuration properties: Task 8
- Error handling and logging: covered in Task 6
- Tests: Task 9

**Placeholder scan:** No TBD, TODO, or vague steps remain. Each step includes exact code or commands.

**Type consistency:** All interfaces use `checkUpdate(context, { silent: boolean })`, `ReleaseAsset`, and `GitHubRelease` consistently.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-27-release-pipeline-self-update.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach would you like?
