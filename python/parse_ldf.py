"""
LDF Parser bridge for VS Code extension.
Uses ldfparser native APIs to parse LDF files and apply CRUD changes.
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


def _serialize_overview(ldf) -> Dict:
    """Serialize header-level metadata for the WebView overview tab.

    The checksum model isn't stored on the LDF object; per LIN spec, classic checksum is used
    only for protocol version 1.x and enhanced for 2.x and later, so we derive it here.
    """
    protocol_version = ldf.get_protocol_version()
    language_version = ldf.get_language_version()
    checksum_model = None
    if protocol_version is not None:
        try:
            major = getattr(protocol_version, "major", None)
            checksum_model = "classic" if major is not None and major < 2 else "enhanced"
        except Exception:
            checksum_model = None

    overview: Dict[str, Any] = {
        "protocol_version": str(protocol_version) if protocol_version is not None else "",
        "language_version": str(language_version) if language_version is not None else "",
        "baudrate": int(ldf.get_baudrate()) if ldf.get_baudrate() is not None else 0,
    }
    channel = ldf.get_channel()
    if channel:
        overview["channel"] = channel
    if checksum_model is not None:
        overview["checksum_model"] = checksum_model
    return overview


def _serialize_product_id(product_id) -> Dict:
    return {
        "supplier_id": product_id.supplier_id,
        "function_id": product_id.function_id,
        "variant": product_id.variant,
    }


def _serialize_nodes(ldf) -> Dict:
    """Serialize master + slave nodes (FR-02 节点视图)."""
    master = ldf.get_master()
    master_payload = None
    if master is not None:
        master_payload = {
            "name": master.name,
            "timebase": master.timebase,
            "jitter": master.jitter,
        }

    slaves_payload: List[Dict] = []
    for slave in ldf.get_slaves():
        entry: Dict[str, Any] = {"name": slave.name}
        if slave.product_id is not None:
            entry["product_id"] = _serialize_product_id(slave.product_id)
        if slave.configured_nad is not None:
            entry["configured_nad"] = slave.configured_nad
        if slave.initial_nad is not None:
            entry["initial_nad"] = slave.initial_nad
        slaves_payload.append(entry)

    return {"master": master_payload, "slaves": slaves_payload}


def _serialize_signals(ldf) -> List[Dict]:
    """Serialize LIN signals to dictionaries using native ldfparser APIs."""
    return [
        {
            "name": signal.name,
            "width": signal.width,
            "init_value": signal.init_value,
            "publisher": signal.publisher.name if signal.publisher else None,
            "subscribers": [sub.name for sub in signal.subscribers],
        }
        for signal in ldf.get_signals()
    ]


def _serialize_frames(ldf) -> List[Dict]:
    """Serialize unconditional frames to dictionaries using native ldfparser APIs."""
    return [
        {
            "name": frame.name,
            "frame_id": frame.frame_id,
            "length": frame.length,
            "publisher": frame.publisher.name if frame.publisher else None,
            "signals": [
                {"signal": signal.name, "offset": offset}
                for offset, signal in frame.signal_map
            ],
        }
        for frame in ldf.get_unconditional_frames()
    ]


def parse_ldf(path: Path) -> dict:
    """Parse LDF file to dictionary using native ldfparser APIs."""
    ensure_ldfparser_on_path()
    import ldfparser

    ldf = ldfparser.parse_ldf(path=str(path))
    return {
        "overview": _serialize_overview(ldf),
        "nodes": _serialize_nodes(ldf),
        "signals": _serialize_signals(ldf),
        "frames": _serialize_frames(ldf),
    }


def save_ldf(ldf_path: Path, data: dict) -> dict:
    """
    Save modified LDF data back to file.

    Re-parses the original LDF, applies CRUD changes to internal structures,
    and saves via ldfparser.save_ldf().
    Note: ldfparser does not expose public mutators on LDF objects,
    so we operate on the internal _signals and _unconditional_frames dicts.
    """
    ensure_ldfparser_on_path()
    import ldfparser
    from ldfparser.signal import LinSignal
    from ldfparser.frame import LinUnconditionalFrame

    try:
        ldf = ldfparser.parse_ldf(path=str(ldf_path))

        if "signals" in data:
            _apply_signal_changes(ldf, data["signals"])

        if "frames" in data:
            _apply_frame_changes(ldf, data["frames"])

        ldfparser.save_ldf(ldf, ldf_path)
        return {"status": "ok", "message": "LDF file saved successfully"}

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to save LDF: {str(e)}",
            "traceback": traceback.format_exc(),
        }


def _apply_signal_changes(ldf, signals_data: List[Dict]) -> None:
    """Apply signal CRUD changes to the LDF object."""
    for sig_data in signals_data:
        action = sig_data.get("_action")
        name = sig_data.get("name")

        if action == "delete":
            if name in ldf._signals:
                del ldf._signals[name]

        elif action == "create":
            width = sig_data.get("width", 8)
            init_value = sig_data.get("init_value", 0)
            new_signal = LinSignal.create(name, width, init_value)

            publisher_name = sig_data.get("publisher")
            if publisher_name:
                _set_publisher(ldf, new_signal, publisher_name)

            for sub_name in sig_data.get("subscribers", []):
                _add_subscriber(ldf, new_signal, sub_name)

            ldf._signals[name] = new_signal

        elif action == "update":
            if name not in ldf._signals:
                continue

            signal = ldf._signals[name]

            if "width" in sig_data:
                signal.width = sig_data["width"]
            if "init_value" in sig_data:
                signal.init_value = sig_data["init_value"]


def _apply_frame_changes(ldf, frames_data: List[Dict]) -> None:
    """Apply frame CRUD changes to the LDF object."""
    for frame_data in frames_data:
        action = frame_data.get("_action")
        name = frame_data.get("name")

        if action == "delete":
            if name in ldf._unconditional_frames:
                del ldf._unconditional_frames[name]

        elif action in ("create", "update"):
            frame_id = frame_data.get("frame_id", 0)
            length = frame_data.get("length", 8)
            signals = frame_data.get("signals", [])

            signal_dict = {}
            for sig_ref in signals:
                sig_name = sig_ref.get("signal")
                offset = sig_ref.get("offset", 0)
                if sig_name and sig_name in ldf._signals:
                    signal_dict[offset] = ldf._signals[sig_name]

            new_frame = LinUnconditionalFrame(
                frame_id=frame_id,
                name=name,
                length=length,
                signals=signal_dict,
            )

            publisher_name = frame_data.get("publisher")
            if publisher_name:
                _set_frame_publisher(ldf, new_frame, publisher_name)

            ldf._unconditional_frames[name] = new_frame


def _find_node(ldf, name: str):
    """Find a node (master or slave) by name using native ldfparser APIs."""
    master = ldf.get_master()
    if master and master.name == name:
        return master
    for slave in ldf.get_slaves():
        if slave.name == name:
            return slave
    return None


def _set_publisher(ldf, signal, publisher_name: str) -> None:
    """Set a signal's publisher using native ldfparser node APIs."""
    node = _find_node(ldf, publisher_name)
    if node:
        signal.publisher = node


def _add_subscriber(ldf, signal, subscriber_name: str) -> None:
    """Add a signal subscriber using native ldfparser node APIs."""
    node = _find_node(ldf, subscriber_name)
    if node:
        signal.subscribers.append(node)


def _set_frame_publisher(ldf, frame, publisher_name: str) -> None:
    """Set a frame's publisher using native ldfparser node APIs."""
    node = _find_node(ldf, publisher_name)
    if node:
        frame.publisher = node


def handle_command(command: str, args: dict) -> dict:
    """Handle various commands from VS Code extension."""
    try:
        if command == "parse":
            ldf_path = Path(args["path"]).expanduser().resolve()
            if not ldf_path.exists():
                return {"status": "error", "message": f"LDF file not found: {ldf_path}"}
            parsed = parse_ldf(ldf_path)
            return {"status": "ok", "data": parsed}

        elif command == "save":
            ldf_path = Path(args["path"]).expanduser().resolve()
            data = args.get("data", {})
            return save_ldf(ldf_path, data)

        else:
            return {"status": "error", "message": f"Unknown command: {command}"}

    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }


def main() -> int:
    """Main entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Expected JSON command as argument"}))
        return 1

    try:
        cmd_input = sys.argv[1]
        cmd_data = json.loads(cmd_input)
        command = cmd_data.get("command")
        args = cmd_data.get("args", {})

        result = handle_command(command, args)
        print(json.dumps(result))
        return 0 if result.get("status") == "ok" else 1

    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "message": f"Invalid JSON input: {e}"}))
        return 1
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e), "traceback": traceback.format_exc()}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
