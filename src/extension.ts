import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PythonBridge } from './service/pythonBridge';
import { LdfService } from './service/ldfService';

/** Tracks open WebView panels keyed by LDF file path to prevent duplicate panels. */
const openPanels = new Map<string, vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ldfExplorer.openLdf', (uri: vscode.Uri) =>
      openLdfDocument(context, uri)
    )
  );
}

async function openLdfDocument(context: vscode.ExtensionContext, uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;

  // Reuse existing panel for the same file
  const existing = openPanels.get(filePath);
  if (existing) {
    existing.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'ldfExplorer',
    path.basename(filePath),
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'dist', 'webview')),
      ],
    }
  );

  openPanels.set(filePath, panel);

  panel.onDidDispose(() => {
    openPanels.delete(filePath);
  });

  // Initialize service layer
  let ldfService: LdfService;
  try {
    const config = vscode.workspace.getConfiguration('ldfExplorer');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    const scriptPath = path.join(context.extensionPath, 'python', 'parse_ldf.py');
    const exePath = path.join(context.extensionPath, 'bin', 'ldfparser-bridge.exe');
    const bridge = new PythonBridge(pythonPath, scriptPath, exePath);
    ldfService = await LdfService.open(bridge, filePath);
  } catch (err: any) {
    panel.webview.html = errorHtml(err.message, err.stack);
    return;
  }

  // Load WebView content
  panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

  // Handle messages from WebView — Extension acts as a pure proxy (no business logic).
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'ready': {
        panel.webview.postMessage({
          type: 'ok',
          payload: buildPayload(ldfService),
        });
        break;
      }

      case 'requestRefresh': {
        panel.webview.postMessage({ type: 'loading' });
        try {
          await ldfService.refresh();
          panel.webview.postMessage({
            type: 'ok',
            payload: buildPayload(ldfService),
          });
        } catch (err: any) {
          panel.webview.postMessage({
            type: 'error',
            payload: err.message,
            traceback: err.stack,
          });
        }
        break;
      }

      case 'saveChanges': {
        panel.webview.postMessage({ type: 'loading' });
        try {
          if (message.payload?.signals) {
            ldfService.signalService.applyChanges(message.payload.signals);
          }
          if (message.payload?.frames) {
            ldfService.frameService.applyChanges(message.payload.frames);
          }
          await ldfService.save();
          panel.webview.postMessage({
            type: 'ok',
            payload: buildPayload(ldfService),
          });
        } catch (err: any) {
          panel.webview.postMessage({
            type: 'saveError',
            payload: err.message,
          });
        }
        break;
      }

      default:
        break;
    }
  });
}

/** Builds the payload sent back to WebView on every successful response. */
function buildPayload(ldfService: LdfService): Record<string, unknown> {
  return {
    overview: ldfService.getOverview(),
    nodes: ldfService.getNodes(),
    signals: ldfService.signalService.list(),
    frames: ldfService.frameService.list(),
  };
}

/** Loads Vue build if available; falls back to a placeholder HTML until webview/ is built. */
function getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
  const webviewDir = path.join(extensionPath, 'dist', 'webview');
  const indexPath = path.join(webviewDir, 'index.html');

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf-8');
    // Rewrite relative asset URLs to use webview.asWebviewUri
    const baseUri = webview.asWebviewUri(vscode.Uri.file(webviewDir)).toString();
    html = html.replace(/(src|href)="\.\//g, `$1="${baseUri}/`);
    return html;
  }

  // Placeholder until Vue build is ready
  return placeholderHtml();
}

function placeholderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; style-src 'unsafe-inline';">
  <title>LDF Explorer</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; color: #333; }
    h1 { font-size: 1.5rem; }
    .status { margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>LDF Explorer</h1>
  <p>WebView content will be loaded here when the Vue build is ready.</p>
  <div class="status" id="status">Waiting for Extension...</div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'ok') {
        document.getElementById('status').textContent = 'Data loaded: ' +
          msg.payload.signals.length + ' signals, ' +
          msg.payload.frames.length + ' frames';
      } else if (msg.type === 'error') {
        document.getElementById('status').textContent = 'Error: ' + msg.payload;
      }
    });
  </script>
</body>
</html>`;
}

function errorHtml(message: string, traceback?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>LDF Explorer - Error</title></head>
<body>
  <h2>Failed to load LDF file</h2>
  <pre>${message}</pre>
  ${traceback ? `<pre>${traceback}</pre>` : ''}
</body>
</html>`;
}

export function deactivate(): void {
  for (const panel of openPanels.values()) {
    panel.dispose();
  }
  openPanels.clear();
}
