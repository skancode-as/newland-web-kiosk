#!/usr/bin/env python3
"""Host-side runtime probe for the Newland MT90 Web Kiosk.

Serves the repository over HTTP on 127.0.0.1, opens a page (``spike/auto.html``
by default) in ``com.nls.nlbrowser`` through ``adb reverse``, and records every
report the page posts to ``/__report``.

The probe is observational. It installs nothing, changes no device settings and
never force-stops the kiosk. Its only device-side changes are a temporary
``adb reverse`` mapping and opening one URL; the mapping is removed on exit.

Usage:
    python3 scripts/adb-runtime-probe.py
    python3 scripts/adb-runtime-probe.py --serial MT9055W4EL00736
    python3 scripts/adb-runtime-probe.py --port 8765 --wait 60
    python3 scripts/adb-runtime-probe.py --page /spike/method-probe.html
    ADB=/opt/platform-tools/adb python3 scripts/adb-runtime-probe.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Pattern, Sequence, Tuple
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
REPORT_JSONL = ARTIFACTS / "runtime-probe.jsonl"
SCREENSHOT = ARTIFACTS / "runtime-probe.png"

DEFAULT_PAGE = "/spike/auto.html"
KIOSK_SCHEME = "newlandhttp"
MAX_REPORT_BYTES = 1 * 1024 * 1024
ADB_TIMEOUT = 20.0
HELLO_DEADLINE = 15.0


class ProbeError(RuntimeError):
    """A user-facing setup or device error."""


# ---------------------------------------------------------------------------
# adb helpers
# ---------------------------------------------------------------------------


def adb_prefix(adb_bin: str, serial: Optional[str]) -> List[str]:
    command = [adb_bin]
    if serial:
        command.extend(["-s", serial])
    return command


def run_adb(
    adb_bin: str,
    serial: Optional[str],
    args: Sequence[str],
    *,
    timeout: float = ADB_TIMEOUT,
    binary: bool = False,
) -> subprocess.CompletedProcess:
    command = adb_prefix(adb_bin, serial) + list(args)
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=not binary,
            timeout=timeout,
            errors=None if binary else "replace",
        )
    except FileNotFoundError:
        raise ProbeError(
            "Could not run adb ({!r}). Install Android platform-tools, put adb "
            "on PATH, or pass --adb /path/to/adb (or set ADB).".format(adb_bin)
        ) from None
    except PermissionError:
        raise ProbeError(
            "adb ({!r}) is not executable. Check the --adb path or ADB.".format(adb_bin)
        ) from None
    except subprocess.TimeoutExpired:
        raise ProbeError(
            "adb timed out after {:.0f}s: {}".format(timeout, " ".join(command))
        ) from None


def adb_text(result: subprocess.CompletedProcess) -> str:
    parts = [
        (result.stdout or "").strip(),
        (result.stderr or "").strip(),
    ]
    return "\n".join(part for part in parts if part)


def resolve_device(adb_bin: str, requested: Optional[str]) -> str:
    result = run_adb(adb_bin, None, ["devices", "-l"])
    output = adb_text(result)
    if result.returncode != 0:
        raise ProbeError(
            "'adb devices -l' failed. Is the adb server running?\n" + output
        )

    print("adb devices -l:")
    print(output or "(no output)")
    print()

    connected: List[Tuple[str, str]] = []
    unavailable: List[Tuple[str, str]] = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        serial, state = parts[0], parts[1]
        if state == "device":
            connected.append((serial, state))
        elif state in ("unauthorized", "offline"):
            unavailable.append((serial, state))

    if requested:
        if any(serial == requested for serial, _ in connected):
            print("Using serial: {}".format(requested))
            return requested
        for serial, state in unavailable:
            if serial == requested:
                if state == "unauthorized":
                    raise ProbeError(
                        "Device {} is unauthorized. Unlock the MT90 and accept "
                        "the USB debugging prompt, then re-run.".format(requested)
                    )
                raise ProbeError(
                    "Device {} is {} (not ready). Reconnect it and re-run.".format(
                        requested, state
                    )
                )
        raise ProbeError(
            "Device {} is not available. Check the USB cable and "
            "'adb devices -l'.".format(requested)
        )

    if not connected:
        if unavailable:
            serial, state = unavailable[0]
            if state == "unauthorized":
                raise ProbeError(
                    "Device {} is unauthorized. Unlock the MT90 and accept the "
                    "USB debugging prompt, then re-run.".format(serial)
                )
            raise ProbeError(
                "Device {} is {} (not ready). Reconnect it and re-run.".format(
                    serial, state
                )
            )
        raise ProbeError(
            "No authorized adb device found. Connect the MT90 over USB, enable "
            "USB debugging and authorize this computer."
        )

    if len(connected) > 1:
        listing = "\n".join(
            "  {} ({})".format(serial, state) for serial, state in connected
        )
        raise ProbeError(
            "Multiple adb devices are connected:\n{}\n"
            "Pass --serial <serial> to choose one; refusing to guess.".format(listing)
        )

    serial = connected[0][0]
    print("Using serial: {}".format(serial))
    return serial


# ---------------------------------------------------------------------------
# Report state
# ---------------------------------------------------------------------------


def json_preview(value: Any, limit: int = 240) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        text = repr(value)
    if len(text) > limit:
        return text[:limit] + "…[+{}]".format(len(text) - limit)
    return text


def summarize(report: Dict[str, Any]) -> str:
    kind = report.get("kind")
    parts = ["kind={}".format(kind)]

    if kind == "hello":
        scan = report.get("nlScan")
        scan = scan if isinstance(scan, dict) else {}
        keys = scan.get("keys")
        keys = keys if isinstance(keys, list) else []
        parts.append("nlScan={}".format(scan.get("type")))
        parts.append("keys={}".format(len(keys)))
        if scan.get("keysError"):
            parts.append("keysError={}".format(scan.get("keysError")))
    elif kind in ("barcode", "nfc", "nhub"):
        parts.append("globalName={}".format(report.get("globalName")))
        parts.append("argsLength={}".format(report.get("argsLength")))
        arg_types = report.get("argTypes")
        if isinstance(arg_types, list):
            parts.append("argTypes={}".format(",".join(map(str, arg_types))))
        parts.append("args={}".format(json_preview(report.get("args"))))
    elif kind == "surface":
        scan = report.get("nlScan")
        scan = scan if isinstance(scan, dict) else {}
        parts.append("nlScan={}".format(scan.get("type")))
        parts.append("callbacks={}".format(report.get("callbackCount")))
    elif kind == "control":
        parts.append("action={}".format(report.get("action")))
        parts.append("result={}".format(json_preview(report.get("result"))))
    elif kind == "call":
        parts.append("seq={}".format(report.get("seq")))
        parts.append("method={}".format(report.get("method")))
        parts.append("args={}".format(json_preview(report.get("args"))))
        parts.append("ok={}".format(report.get("ok")))
        if report.get("ok"):
            parts.append("result={}".format(json_preview(report.get("result"))))
        else:
            parts.append(
                "error={}".format(
                    json_preview(report.get("error") or report.get("result"))
                )
            )
    elif kind == "done":
        parts.append("calls={}".format(report.get("calls")))
        parts.append("elapsedMs={}".format(report.get("elapsedMs")))
    else:
        extra = {
            key: report[key]
            for key in ("globalName", "argsLength", "error", "reason")
            if key in report
        }
        if extra:
            parts.append(json_preview(extra))

    return " ".join(parts)


class ReportState:
    def __init__(self, jsonl_path: Path) -> None:
        self.jsonl_path = jsonl_path
        self.lock = threading.Lock()
        self.report_count = 0
        self.callback_count = 0
        self.hello_received = threading.Event()

    def record(self, report: Dict[str, Any]) -> None:
        kind = report.get("kind")
        if not isinstance(kind, str) or not kind.strip():
            raise ValueError("report is missing a non-empty string 'kind'")

        try:
            line = json.dumps(report, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError) as exc:
            raise ValueError("report is not JSON-serializable: {}".format(exc))

        with self.lock:
            self.report_count += 1
            number = self.report_count
            if kind in ("barcode", "nfc", "nhub"):
                self.callback_count += 1
            with self.jsonl_path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
            if kind == "hello":
                self.hello_received.set()
            print(
                "[report {}] {}".format(number, summarize(report)),
                flush=True,
            )


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------


def make_handler(state: ReportState):
    class ProbeHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(ROOT), **kwargs)

        # Normal GETs are intentionally quiet; only 4xx/5xx are logged.
        def log_message(self, fmt: str, *args: Any) -> None:
            try:
                message = fmt % args
            except (TypeError, ValueError):
                message = str(fmt)
            if message.startswith("code 4") or message.startswith("code 5"):
                sys.stderr.write(
                    "[http {}] {}\n".format(self.address_string(), message)
                )
                sys.stderr.flush()

        def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            if urlsplit(self.path).path != "/__report":
                self.send_error(404, "Not found")
                return
            self.send_response(204)
            self._cors_headers()
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            if urlsplit(self.path).path != "/__report":
                self.send_error(404, "Not found")
                return

            length_header = self.headers.get("Content-Length")
            if length_header is None:
                self.send_error(411, "Content-Length is required")
                return
            try:
                length = int(length_header)
            except ValueError:
                self.send_error(400, "Invalid Content-Length")
                return
            if length < 0 or length > MAX_REPORT_BYTES:
                self.send_error(413, "Report is too large")
                return

            try:
                raw = self.rfile.read(length)
            except OSError as exc:
                sys.stderr.write("[http] could not read report: {}\n".format(exc))
                self.send_error(400, "Could not read report")
                return

            try:
                report = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                self.send_error(400, "Invalid JSON: {}".format(exc))
                return

            if not isinstance(report, dict):
                self.send_error(400, "Report must be a JSON object")
                return

            try:
                state.record(report)
            except ValueError as exc:
                self.send_error(400, "Invalid report: {}".format(exc))
                return

            self.send_response(204)
            self._cors_headers()
            self.end_headers()

        def _cors_headers(self) -> None:
            # The kiosk may rewrite newlandhttp:// to http://, which can make
            # the absolute fallback URL cross-origin. Reports are local-only.
            self.send_header("Access-Control-Allow-Origin", "*")

    return ProbeHandler


def start_server(
    port: int, state: ReportState
) -> Tuple[ThreadingHTTPServer, threading.Thread]:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(state))
    except OSError as exc:
        raise ProbeError(
            "Could not listen on 127.0.0.1:{}: {}. Choose another --port.".format(
                port, exc
            )
        ) from None
    server.daemon_threads = True
    thread = threading.Thread(
        target=server.serve_forever, name="runtime-probe-http", daemon=True
    )
    thread.start()
    return server, thread


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


def print_filtered(
    title: str,
    result: subprocess.CompletedProcess,
    pattern: Pattern[str],
) -> None:
    print("\n-- {} --".format(title))
    if result.returncode != 0:
        print("(adb command failed)")
        output = adb_text(result)
        if output:
            print(output)
        return

    output = (result.stdout or "").replace("\r", "")
    matches = [line for line in output.splitlines() if pattern.search(line)]
    if matches:
        print("\n".join(matches))
    else:
        print("(no matching lines)")


def run_diagnostics(adb_bin: str, serial: str) -> None:
    print(
        "\n===== diagnostics: no hello report within {:.0f}s =====".format(
            HELLO_DEADLINE
        ),
        flush=True,
    )

    checks = [
        (
            "resumed activity",
            ["shell", "dumpsys", "activity", "activities"],
            re.compile(r"mResumedActivity|topResumedActivity|ResumedActivity"),
        ),
        (
            "focused window",
            ["shell", "dumpsys", "window", "windows"],
            re.compile(r"mCurrentFocus|mFocusedApp"),
        ),
        (
            "logcat (last 300 lines, filtered)",
            ["shell", "logcat", "-d", "-t", "300"],
            re.compile(r"nlwebkiosk|chromium|webview|nlscan|nlbrowser", re.IGNORECASE),
        ),
        (
            "WebView devtools sockets",
            ["shell", "cat", "/proc/net/unix"],
            re.compile(r"webview_devtools_remote", re.IGNORECASE),
        ),
    ]

    for title, args, pattern in checks:
        try:
            result = run_adb(adb_bin, serial, args, timeout=30.0)
        except ProbeError as exc:
            print("\n-- {} --".format(title))
            print("(failed: {})".format(exc))
            continue
        print_filtered(title, result, pattern)

    print("\n===== end diagnostics =====\n", flush=True)


# ---------------------------------------------------------------------------
# Screenshot and cleanup
# ---------------------------------------------------------------------------


def capture_screenshot(adb_bin: str, serial: str) -> bool:
    print("\nTaking screenshot…", flush=True)
    try:
        result = run_adb(
            adb_bin,
            serial,
            ["exec-out", "screencap", "-p"],
            timeout=30.0,
            binary=True,
        )
    except ProbeError as exc:
        sys.stderr.write("WARN: screenshot failed: {}\n".format(exc))
        return False

    data = result.stdout or b""
    if result.returncode != 0 or not data:
        stderr = (result.stderr or b"").decode("utf-8", "replace").strip()
        sys.stderr.write(
            "WARN: screencap returned no image{}{}\n".format(
                " (exit {})".format(result.returncode)
                if result.returncode != 0
                else "",
                ": " + stderr if stderr else "",
            )
        )
        return False

    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        sys.stderr.write(
            "WARN: screencap output does not look like a PNG; saving it anyway.\n"
        )

    try:
        SCREENSHOT.write_bytes(data)
    except OSError as exc:
        sys.stderr.write("WARN: could not write {}: {}\n".format(SCREENSHOT, exc))
        return False

    print("Screenshot: {}".format(SCREENSHOT))
    return True


def remove_reverse(adb_bin: str, serial: str, port: int) -> None:
    try:
        result = run_adb(
            adb_bin, serial, ["reverse", "--remove", "tcp:{}".format(port)]
        )
    except ProbeError as exc:
        sys.stderr.write("WARN: could not remove adb reverse mapping: {}\n".format(exc))
        return
    if result.returncode == 0:
        print("Removed adb reverse tcp:{} tcp:{}".format(port, port))
    else:
        sys.stderr.write(
            "WARN: could not remove adb reverse mapping: {}\n".format(adb_text(result))
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def normalize_page(page: str, parser: argparse.ArgumentParser) -> str:
    """Return *page* as an absolute repository path."""
    page = page.strip()
    if not page:
        parser.error("--page must not be empty")
    if "://" in page:
        parser.error("--page must be a repository path, not a full URL")
    if not page.startswith("/"):
        page = "/" + page
    return page


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Serve a page from the repository, open it in the Newland Web Kiosk "
            "over adb reverse, and record the bridge reports it posts."
        )
    )
    parser.add_argument(
        "--serial",
        help="adb serial. Auto-detected when exactly one device is attached.",
    )
    parser.add_argument(
        "--page",
        default=DEFAULT_PAGE,
        help=(
            "repository-relative page to open, e.g. /spike/method-probe.html "
            "(default: {})".format(DEFAULT_PAGE)
        ),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="host HTTP port, also used for adb reverse (default: 8765)",
    )
    parser.add_argument(
        "--wait",
        type=float,
        default=45.0,
        help="seconds to collect reports before stopping (default: 45)",
    )
    parser.add_argument(
        "--adb",
        default=os.environ.get("ADB") or "adb",
        help="adb binary (default: $ADB or adb)",
    )
    args = parser.parse_args(argv)

    args.page = normalize_page(args.page, parser)

    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if args.wait <= 0:
        parser.error("--wait must be greater than zero")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    try:
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        REPORT_JSONL.touch(exist_ok=True)
    except OSError as exc:
        print(
            "ERROR: could not create {}: {}".format(ARTIFACTS, exc),
            file=sys.stderr,
        )
        return 1

    url = "{}://localhost:{}{}".format(KIOSK_SCHEME, args.port, args.page)
    state = ReportState(REPORT_JSONL)

    server: Optional[ThreadingHTTPServer] = None
    server_thread: Optional[threading.Thread] = None
    serial: Optional[str] = None
    reverse_added = False
    exit_code = 0

    print("Newland MT90 runtime probe")
    print("Repository: {}".format(ROOT))
    print("adb: {}".format(args.adb))
    print()

    try:
        serial = resolve_device(args.adb, args.serial)

        server, server_thread = start_server(args.port, state)
        print("Serving {} at http://127.0.0.1:{}".format(ROOT, args.port))

        reverse = run_adb(
            args.adb,
            serial,
            ["reverse", "tcp:{}".format(args.port), "tcp:{}".format(args.port)],
        )
        if reverse.returncode != 0:
            raise ProbeError("adb reverse failed:\n{}".format(adb_text(reverse)))
        reverse_added = True
        print("adb reverse tcp:{port} tcp:{port} active".format(port=args.port))

        print("Launching: {}".format(url))
        start_result = run_adb(
            args.adb,
            serial,
            [
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
            ],
            timeout=30.0,
        )
        stdout = (start_result.stdout or "").strip()
        stderr = (start_result.stderr or "").strip()
        print("am start stdout:")
        print(stdout or "(empty)")
        print("am start stderr:")
        print(stderr or "(empty)")

        combined = "\n".join(part for part in (stdout, stderr) if part)
        if start_result.returncode != 0:
            print(
                "\nWARN: am start exited {}; the kiosk may have refused the "
                "URL.".format(start_result.returncode)
            )
        elif re.search(
            r"(^|\W)Error:|does not exist|unable to resolve|No Activity found",
            combined,
            re.IGNORECASE,
        ):
            print(
                "\nWARN: am start reported an error; the kiosk may have "
                "refused the URL."
            )
        elif re.search(r"Activity not started", combined, re.IGNORECASE):
            print(
                "\nNOTE: am start reported 'Activity not started'; it may have "
                "reused an existing task."
            )

        print(
            "\nCollecting reports for {:.0f}s. Scan a barcode or tap Trigger "
            "on the device.".format(args.wait)
        )
        print(
            "If nothing arrives, check that the kiosk opened {}.".format(url),
            flush=True,
        )

        started = time.monotonic()
        deadline = started + args.wait
        diagnostics_done = False
        while time.monotonic() < deadline:
            if (
                not diagnostics_done
                and not state.hello_received.is_set()
                and time.monotonic() - started >= HELLO_DEADLINE
            ):
                run_diagnostics(args.adb, serial)
                diagnostics_done = True
            time.sleep(0.2)

        if not state.hello_received.is_set():
            print(
                "\nNo hello report arrived. See the diagnostics above and the "
                "screenshot.",
                file=sys.stderr,
            )
            exit_code = 2
        else:
            print(
                "\nReceived {} report(s), {} callback report(s).".format(
                    state.report_count, state.callback_count
                )
            )

    except ProbeError as exc:
        print("\nERROR: {}".format(exc), file=sys.stderr)
        exit_code = 1
    except KeyboardInterrupt:
        print("\nInterrupted; cleaning up.", file=sys.stderr)
        exit_code = 130
    finally:
        if serial:
            capture_screenshot(args.adb, serial)
            if reverse_added:
                remove_reverse(args.adb, serial, args.port)
        else:
            print("\nScreenshot skipped: no device was selected.", file=sys.stderr)

        if server is not None:
            server.shutdown()
            server.server_close()
            if server_thread is not None:
                server_thread.join(timeout=5.0)

        print()
        print("Report log: {}".format(REPORT_JSONL))
        print("Screenshot: {}".format(SCREENSHOT))

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
