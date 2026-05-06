# CLAUDE.md

VS Code extension for exploring and editing LIN Description Files (LDF). **Currently being rewritten.** Old source (`src/`, `media/`, `dist/`) has been deleted. New architecture: Extension Host + Vue 3 SPA (Vite) in WebView + Service Layer + Python bridge.

Preserved assets: `python/ldfparser/` (vendored, do not modify), `python/parse_ldf.py` (bridge script).

## Build Commands

```bash
# Extension (TypeScript)
npm run compile        # Compile once
npm run watch          # Watch mode
npm run vscode:prepublish

# WebView (Vue 3 + Vite)
cd webview
npm install
npm run build          # Production → dist/webview/
npm run dev            # Local dev server (VS Code APIs unavailable)
```

## Architecture

```
Extension Host (Node.js)
  │ postMessage
  ▼
WebView (Vue 3 SPA, isolated iframe)

Extension Host imports Service Layer module directly.
CLI imports the same Service Layer module directly.
Service Layer spawns Python bridge.
```

Extension Host is a proxy between WebView and Service Layer — it forwards postMessage calls to Service Layer methods and returns results. No HTTP.

## Important info

Source code pf ldf python lib in ../ldfparser, you can find out how to use this lib in this path. If you need to kown how to use ldf python lib, read ../ldfparser/README.md.

## Communication

### WebView ↔ Extension (postMessage)

**WebView → Extension:**
- `{ type: 'ready' }` — WebView loaded, request initial data
- `{ type: 'requestRefresh' }` — Discard changes and re-parse file
- `{ type: 'saveChanges', payload: { signals: LdfChange[], frames: LdfChange[] } }` — Persist edits

**Extension → WebView:**
- `{ type: 'loading' }` — Parse/save in progress
- `{ type: 'ok', payload: LdfDict }` — Parse succeeded
- `{ type: 'error', payload: string, traceback?: string }` — Parse/save failed
- `{ type: 'saveError', payload: string }` — Save-specific failure

### Service Layer ↔ Python Bridge

Service spawns `python parse_ldf.py '<json>'`. Python writes one JSON line to stdout.

```json
{ "command": "parse"|"save", "args": { ... } }
```

- **Parse**: `args.path` → `{ status: 'ok', data: LdfDict }` or `{ status: 'error', message, traceback }`
- **Save**: `args.path`, `args.data.signals`, `args.data.frames` → applies CRUD changes and writes back via `ldfparser.save_ldf()`

## Types

```typescript
interface LdfChange<T> {
  _action: 'create' | 'update' | 'delete';
  _id?: string;       // Frontend temp ID for created items
  _editing?: boolean; // Inline edit mode flag
  data: T;
}
```

## TypeScript Config

- `tsconfig.json`: `target: ES2020`, `module: commonjs`, `outDir: dist`, `rootDir: src`, `strict: true`
- Extension entry: `dist/extension.js` (configured in `package.json` `"main"`)

## Code Style

### Comments

- **No WHAT comments.** Code must explain itself via naming.
- **Write WHY comments** for non-obvious constraints, invariants, or design decisions that would surprise a reader.
- **Keep it to one line.** No multi-line docstrings or paragraph blocks.
- **Examples of good comments:**
  - `// Uses Math.pow instead of bit-shift to avoid overflow at width === 64`
  - `// Error handling order matters: Python may emit { status: 'error' } even with exit code 1`
  - `// Cache is already the correct state (Strategy C); no re-parse needed`
  - `// Extension acts as a pure proxy (no business logic)`

## Constraints

- **Do not modify `python/ldfparser/`**. If parsing behavior needs to change, modify `python/parse_ldf.py` instead.
- **WebView CSP**: Generate a nonce and allow `'unsafe-eval'` for Vue 3 runtime compilation (or use fully pre-compiled build to avoid it).
- **Python path**: Read setting `ldfExplorer.pythonPath` (default `"python"`).
