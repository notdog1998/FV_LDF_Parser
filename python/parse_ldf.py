"""
LDF Parser bridge for VS Code extension.
Supports parsing and saving LDF files with CRUD operations.
"""
import json
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List


def ensure_ldfparser_on_path() -> None:
    """Enable importing the vendored ldfparser package."""
    current_dir = Path(__file__).resolve().parent
    ldfparser_dir = current_dir / "ldfparser"
    if str(ldfparser_dir) not in sys.path:
        sys.path.insert(0, str(ldfparser_dir))


def parse_ldf(path: Path) -> dict:
    """Parse LDF file to dictionary."""
    ensure_ldfparser_on_path()
    import ldfparser
    return ldfparser.parse_ldf_to_dict(path=str(path))


def save_ldf(ldf_path: Path, data: dict) -> dict:
    """
    Save modified LDF data back to file.

    This function uses the ldfparser library to parse the original LDF,
    apply modifications to the internal data structures, and then save
    using the Jinja2 template.
    """
    ensure_ldfparser_on_path()
    import ldfparser
    from ldfparser.ldf import LDF
    from ldfparser.signal import LinSignal
    from ldfparser.frame import LinUnconditionalFrame
    from ldfparser.save import save_ldf as ldf_save

    try:
        # Parse original LDF to get LDF object
        ldf = ldfparser.parse_ldf(path=str(ldf_path))

        # Apply signal modifications
        if 'signals' in data:
            _apply_signal_changes(ldf, data['signals'])

        # Apply frame modifications
        if 'frames' in data:
            _apply_frame_changes(ldf, data['frames'])

        # Save back to file
        ldf_save(ldf, ldf_path)
        return {"status": "ok", "message": "LDF file saved successfully"}

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to save LDF: {str(e)}",
            "traceback": traceback.format_exc()
        }


def _apply_signal_changes(ldf, signals_data: List[Dict]) -> None:
    """Apply signal changes to LDF object."""
    for sig_data in signals_data:
        action = sig_data.get('_action')
        name = sig_data.get('name')

        if action == 'delete':
            # Remove signal from LDF
            if name in ldf._signals:
                del ldf._signals[name]

        elif action == 'create':
            # Create new signal
            width = sig_data.get('width', 8)
            init_value = sig_data.get('init_value', 0)

            # Validate signal parameters
            new_signal = LinSignal.create(name, width, init_value)

            # Set publisher/subscribers
            publisher_name = sig_data.get('publisher')
            if publisher_name:
                # Try to find publisher node
                if ldf._master and ldf._master.name == publisher_name:
                    new_signal.publisher = ldf._master
                elif publisher_name in ldf._slaves:
                    new_signal.publisher = ldf._slaves[publisher_name]

            # Add subscribers
            for sub_name in sig_data.get('subscribers', []):
                if ldf._master and ldf._master.name == sub_name:
                    new_signal.subscribers.append(ldf._master)
                elif sub_name in ldf._slaves:
                    new_signal.subscribers.append(ldf._slaves[sub_name])

            ldf._signals[name] = new_signal

        elif action == 'update':
            # Update existing signal
            if name not in ldf._signals:
                continue

            signal = ldf._signals[name]

            # Update width if changed
            if 'width' in sig_data:
                signal.width = sig_data['width']

            # Update init_value if changed
            if 'init_value' in sig_data:
                signal.init_value = sig_data['init_value']


def _apply_frame_changes(ldf, frames_data: List[Dict]) -> None:
    """Apply frame changes to LDF object."""
    for frame_data in frames_data:
        action = frame_data.get('_action')
        name = frame_data.get('name')

        if action == 'delete':
            # Remove frame from LDF
            if name in ldf._unconditional_frames:
                del ldf._unconditional_frames[name]

        elif action in ('create', 'update'):
            # For create/update, we need to rebuild the frame
            frame_id = frame_data.get('frame_id', 0)
            length = frame_data.get('length', 8)
            signals = frame_data.get('signals', [])

            # Build signal dictionary {offset: signal}
            signal_dict = {}
            for sig_ref in signals:
                sig_name = sig_ref.get('signal')
                offset = sig_ref.get('offset', 0)

                if sig_name and sig_name in ldf._signals:
                    signal_dict[offset] = ldf._signals[sig_name]

            # Create new frame
            new_frame = LinUnconditionalFrame(
                frame_id=frame_id,
                name=name,
                length=length,
                signals=signal_dict
            )

            # Set publisher
            publisher_name = frame_data.get('publisher')
            if publisher_name:
                if ldf._master and ldf._master.name == publisher_name:
                    new_frame.publisher = ldf._master
                elif publisher_name in ldf._slaves:
                    new_frame.publisher = ldf._slaves[publisher_name]

            ldf._unconditional_frames[name] = new_frame


def handle_command(command: str, args: dict) -> dict:
    """Handle various commands from VS Code extension."""
    try:
        if command == 'parse':
            ldf_path = Path(args['path']).expanduser().resolve()
            if not ldf_path.exists():
                return {"status": "error", "message": f"LDF file not found: {ldf_path}"}
            parsed = parse_ldf(ldf_path)
            return {"status": "ok", "data": parsed}

        elif command == 'save':
            ldf_path = Path(args['path']).expanduser().resolve()
            data = args.get('data', {})
            return save_ldf(ldf_path, data)

        else:
            return {"status": "error", "message": f"Unknown command: {command}"}

    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc),
            "traceback": traceback.format_exc()
        }


def main() -> int:
    """Main entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "status": "error",
            "message": "Expected JSON command as argument"
        }))
        return 1

    try:
        # Parse command from JSON argument
        cmd_input = sys.argv[1]
        cmd_data = json.loads(cmd_input)
        command = cmd_data.get('command')
        args = cmd_data.get('args', {})

        result = handle_command(command, args)
        print(json.dumps(result))
        return 0 if result.get('status') == 'ok' else 1

    except json.JSONDecodeError as e:
        print(json.dumps({
            "status": "error",
            "message": f"Invalid JSON input: {e}"
        }))
        return 1
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }))
        return 1


if __name__ == "__main__":
    sys.exit(main())
