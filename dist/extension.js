"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
function activate(context) {
    const ldfProvider = new LdfEditorProvider(context);
    const openCommand = vscode.commands.registerCommand('ldfExplorer.openLdf', async (uri) => {
        const target = await resolveTargetUri(uri);
        if (!target) {
            return;
        }
        await ldfProvider.openLdfEditor(target);
    });
    context.subscriptions.push(openCommand);
}
function deactivate() {
    // nothing to cleanup yet
}
class LdfEditorProvider {
    constructor(context) {
        this.context = context;
        this.panels = new Map();
    }
    async openLdfEditor(uri) {
        const fsPath = uri.fsPath;
        const fileName = path.basename(fsPath);
        // Check if panel already exists for this file
        const existingPanel = this.panels.get(fsPath);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        const panel = vscode.window.createWebviewPanel('ldfExplorer', `LDF: ${fileName}`, vscode.ViewColumn.Beside, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ],
            retainContextWhenHidden: true
        });
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
    async handleMessage(message, panel, fsPath) {
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
    async sendParsedData(panel, ldfPath) {
        panel.webview.postMessage({ type: 'loading' });
        const result = await this.parseLdfFile(ldfPath);
        panel.webview.postMessage({
            type: result.status,
            payload: result.status === 'ok' ? result.data : result.message,
            traceback: 'traceback' in result ? result.traceback : undefined
        });
    }
    async handleSaveChanges(changes, panel, fsPath) {
        const result = await this.saveLdfFile(fsPath, changes);
        if (result.status === 'ok') {
            vscode.window.showInformationMessage('LDF file saved successfully');
            // Refresh data after save
            await this.sendParsedData(panel, fsPath);
        }
        else {
            vscode.window.showErrorMessage(`Failed to save LDF: ${result.message}`);
            panel.webview.postMessage({
                type: 'saveError',
                payload: result.message
            });
        }
    }
    async parseLdfFile(ldfPath) {
        return this.runPythonCommand('parse', { path: ldfPath });
    }
    async saveLdfFile(ldfPath, data) {
        return this.runPythonCommand('save', { path: ldfPath, data });
    }
    async runPythonCommand(command, args) {
        const pythonExecutable = vscode.workspace.getConfiguration('ldfExplorer').get('pythonPath') ?? 'python';
        const scriptUri = vscode.Uri.joinPath(this.context.extensionUri, 'python', 'parse_ldf.py');
        const scriptPath = scriptUri.fsPath;
        const cmdJson = JSON.stringify({ command, args });
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(pythonExecutable, [scriptPath, cmdJson], {
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
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (parseError) {
                    resolve({
                        status: 'error',
                        message: `Failed to parse Python output: ${parseError.message}\nRaw output: ${stdout}`
                    });
                }
            });
        });
    }
    getWebviewContent(webview) {
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
async function resolveTargetUri(explicit) {
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
function getNonce() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
}
//# sourceMappingURL=extension.js.map