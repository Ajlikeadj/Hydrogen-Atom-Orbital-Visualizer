#!/usr/bin/env python3
"""Zero-dependency local server for the Hydrogen Orbital Visualizer.

Uses only the Python standard library — no pip installs required.

Usage:
    python serve.py              # serve idk2.html and open it in the browser
    python serve.py -p 9000      # use a custom port
    python serve.py --no-browser # don't open a browser tab
"""
import argparse
import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"  [server] {self.address_string()} — {fmt % args}")

    def end_headers(self):
        # Nothing here needs caching; it's a local dev page.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(
        description="Serve the Hydrogen Orbital Visualizer locally."
    )
    parser.add_argument(
        "-p", "--port", type=int, default=DEFAULT_PORT,
        help=f"port to bind (default {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--no-browser", action="store_true",
        help="do not open a browser tab automatically",
    )
    args = parser.parse_args()

    page = ROOT / "idk2.html"
    if not page.exists():
        print(f"error: {page.name} not found next to serve.py", file=sys.stderr)
        sys.exit(1)

    try:
        server = ThreadingServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        print(f"error: cannot bind port {args.port} ({e})", file=sys.stderr)
        sys.exit(1)

    url = f"http://127.0.0.1:{args.port}/idk2.html"
    print("  Hydrogen Orbital Visualizer")
    print(f"  Serving: {page.name}  ({page.stat().st_size / 1024:.1f} KB)")
    print(f"  URL:     {url}")
    print("  Stop:    Ctrl+C")

    if not args.no_browser:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped. Bye!")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()