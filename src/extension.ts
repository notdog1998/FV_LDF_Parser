import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

type ParserSuccess = {
    status: 'ok';
    data: Record<string, unknown>;
};

type ParserError = {
    status: 'error';
    message: string;
    traceback?: string;
};

type ParserResponse = ParserSuccess | ParserError;

interface LdfChange {
    _action: 'create' | 'update' | 'delete';
    [key: string]: unknown;
}

export function activate(context: vscode.ExtensionContext) {
    const ldfProvider = new LdfEditorProvider(context);

    const openCommand = vscode.commands.registerCommand('ldfExplorer.openLdf', async (uri?: vscode.Uri) => {
        const target = await resolveTargetUri(uri);
        if (!target) {
            return;
        }
        await ldfProvider.openLdfEditor(target);
    });

    context.subscriptions.push(openCommand);
}

export function deactivate() {
    // nothing to cleanup yet
}

class LdfEditorProvider {
    private panels = new Map<string, vscode.WebviewPanel>();

    constructor(private context: vscode.ExtensionContext) {}

    async openLdfEditor(uri: vscode.Uri): Promise<void> {
        const fsPath = uri.fsPath;
        const fileName = path.basename(fsPath);

        // Check if panel already exists for this file
        const existingPanel = this.panels.get(fsPath);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ldfExplorer',
            `LDF: ${fileName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ],
                retainContextWhenHidden: true
            }
        );

        this.panels.set(fsPath, panel);

        panel.webview.html = this.getWebviewContent(panel.webview);

        // Send initial data
        this.sendParsedData(panel, fsPath);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message, panel, fsPath);
        }, undefined, this.context.subscriptions);

        panel.onDidDispose(() => {
            this.panels.delete(fsPath);
        }, undefined, this.context.subscriptions);
    }

    private async handleMessage(
        message: any,
        panel: vscode.WebviewPanel,
        fsPath: string
    ): Promise<void> {
        switch (message?.type) {
            case 'ready':
                await this.sendParsedData(panel, fsPath);
                break;
            case 'requestRefresh':
                await this.sendParsedData(panel, fsPath);
                break;
            case 'saveChanges':
                await this.handleSaveChanges(message.payload, panel, fsPath);
                break;
            default:
                break;
        }
    }

    private async sendParsedData(panel: vscode.WebviewPanel, ldfPath: string): Promise<void> {
        panel.webview.postMessage({ type: 'loading' });
        const result = await this.parseLdfFile(ldfPath);

        panel.webview.postMessage({
            type: result.status,
            payload: result.status === 'ok' ? result.data : result.message,
            traceback: 'traceback' in result ? result.traceback : undefined
        });
    }

    private async handleSaveChanges(
        changes: { signals?: LdfChange[]; frames?: LdfChange[] },
        panel: vscode.WebviewPanel,
        fsPath: string
    ): Promise<void> {
        const result = await this.saveLdfFile(fsPath, changes);

        if (result.status === 'ok') {
            vscode.window.showInformationMessage('LDF file saved successfully');
            // Refresh data after save
            await this.sendParsedData(panel, fsPath);
        } else {
            vscode.window.showErrorMessage(`Failed to save LDF: ${result.message}`);
            panel.webview.postMessage({
                type: 'saveError',
                payload: result.message
            });
        }
    }

    private async parseLdfFile(ldfPath: string): Promise<ParserResponse> {
        return this.runPythonCommand('parse', { path: ldfPath });
    }

    private async saveLdfFile(ldfPath: string, data: { signals?: LdfChange[]; frames?: LdfChange[] }): Promise<ParserResponse> {
        return this.runPythonCommand('save', { path: ldfPath, data });
    }

    private async runPythonCommand(command: string, args: Record<string, unknown>): Promise<ParserResponse> {
        const pythonExecutable = vscode.workspace.getConfiguration('ldfExplorer').get<string>('pythonPath') ?? 'python';
        const scriptUri = vscode.Uri.joinPath(this.context.extensionUri, 'python', 'parse_ldf.py');
        const scriptPath = scriptUri.fsPath;

        const cmdJson = JSON.stringify({ command, args });

        return new Promise((resolve) => {
            const child = spawn(pythonExecutable, [scriptPath, cmdJson], {
                cwd: path.dirname(scriptPath)
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                resolve({
                    status: 'error',
                    message: `Failed to start Python (${pythonExecutable}): ${error.message}`
                });
            });

            child.on('close', () => {
                if (stderr.trim().length > 0) {
                    console.warn('[ldfExplorer] parser stderr:', stderr);
                }

                try {
                    const parsed: ParserResponse = JSON.parse(stdout);
                    resolve(parsed);
                } catch (parseError) {
                    resolve({
                        status: 'error',
                        message: `Failed to parse Python output: ${(parseError as Error).message}\nRaw output: ${stdout}`
                    });
                }
            });
        });
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
        const vueUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vue.global.prod.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${stylesUri}" rel="stylesheet" />
    <title>LDF Explorer</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${vueUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
    }
}

async function resolveTargetUri(explicit?: vscode.Uri): Promise<vscode.Uri | undefined> {
    if (explicit) {
        return explicit;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showWarningMessage('Please open an LDF file first.');
        return undefined;
    }

    if (editor.document.isUntitled) {
        void vscode.window.showWarningMessage('Current document is not saved.');
        return undefined;
    }

    const fileUri = editor.document.uri;
    if (!fileUri.fsPath.toLowerCase().endsWith('.ldf')) {
        void vscode.window.showWarningMessage('Current file is not an LDF file.');
        return undefined;
    }

    return fileUri;
}

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
