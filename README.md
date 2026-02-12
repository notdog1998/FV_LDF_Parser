# LDF Explorer

VS Code extension for exploring and editing LIN Description Files (LDF).

## Features

- **Parse and Display**: View LDF file structure including nodes, signals, and frames
- **Signal Management**: Create, edit, and delete LIN signals
- **Frame Management**: Create, edit, and delete LIN frames with signal mapping
- **Save Changes**: Save modifications back to the LDF file
- **Modern UI**: Clean Vue.js-based webview interface

## Requirements

- VS Code 1.85.0 or higher
- Python 3.8+ (no external packages needed)

## Installation

1. Open the `vscode-ldf-explorer` folder in VS Code
2. Run `npm install` to install dependencies
3. **No need to install ldfparser** - the extension includes a vendored copy in `python/ldfparser/`

## Usage

### Opening an LDF File

1. Open any `.ldf` file in VS Code
2. Click the "Open in LDF Explorer" button in the editor title bar
3. Or right-click an LDF file in the explorer and select "Open in LDF Explorer"
4. Or run command `LDF Explorer: Open in LDF Explorer` from command palette

### Managing Signals

1. In the **Signals** panel, click "+ Add" to create a new signal
2. Fill in signal properties:
   - **Name**: Signal identifier
   - **Width**: Bit width (1-16 for scalar, 8-64 for arrays)
   - **Initial Value**: Default value
3. Click "Edit" to modify existing signals
4. Click "Delete" to remove signals

### Managing Frames

1. In the **Frames** panel, click "+ Add" to create a new frame
2. Fill in frame properties:
   - **Name**: Frame identifier
   - **Frame ID**: LIN frame ID (0-63)
   - **Length**: Frame length in bytes (1-8)
   - **Publisher**: Publishing node
3. Add signal mappings:
   - Click "+ Add Signal" to map signals to the frame
   - Set the bit offset for each signal
4. Click "Edit" to modify existing frames
5. Click "Delete" to remove frames

### Saving Changes

1. After making modifications, click the "Save" button in the toolbar
2. Changes will be written back to the LDF file
3. The view will refresh automatically after saving

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `ldfExplorer.pythonPath` | Python executable path for running ldfparser | `python` |

## Development

### Build

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Package

```bash
vsce package
```

## Architecture

```
vscode-ldf-explorer/
├── src/
│   └── extension.ts      # VS Code extension host code
├── media/
│   ├── main.js          # Vue.js webview application
│   ├── styles.css       # Webview styles
│   └── vue.global.prod.js # Vue 3 runtime
├── python/
│   ├── parse_ldf.py     # Python bridge for ldfparser
│   └── ldfparser/       # VENDORED ldfparser library (no pip install needed)
└── dist/
    └── extension.js     # Compiled extension
```

### Communication Flow

1. User opens LDF file → Extension activates
2. Extension creates Webview panel
3. Python bridge parses LDF file → Returns JSON data
4. Vue.js frontend renders the data
5. User edits signals/frames → Frontend tracks changes
6. User clicks Save → Frontend sends changes to extension
7. Python bridge applies changes and saves LDF file

## Project Structure

```
/mnt/d/Code/01_LDF_PlugIn/01_fv_ldf_exploer/
├── ldfparser/           # LDF parsing library (Python)
│   └── ldfparser/
│       ├── __init__.py
│       ├── parser.py
│       ├── ldf.py
│       ├── signal.py
│       ├── frame.py
│       ├── node.py
│       ├── save.py
│       └── templates/
│           └── ldf.jinja2
└── vscode-ldf-explorer/ # VS Code extension
    ├── src/
    │   └── extension.ts
    ├── media/
    │   ├── main.js
    │   └── styles.css
    ├── python/
    │   └── parse_ldf.py
    └── package.json
```

## License

ISC
