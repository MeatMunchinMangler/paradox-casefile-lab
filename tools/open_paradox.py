#!/usr/bin/env python3
"""User-invoked, one-command local PARADOX launch.

No public binding, third-party provider, browser automation, background
daemon or persistent external service. The browser opens only when the
owner explicitly launches OPEN_PARADOX.command.
"""
from pathlib import Path
import sys
import webbrowser

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_server


def main():
    with make_server(0) as server:
        url = "http://127.0.0.1:%d/" % server.server_port
        print("\nPARADOX — OPEN YOUR CASEFILE", flush=True)
        print("Local URL: " + url, flush=True)
        print("The site is available only on this Mac.", flush=True)
        print("Ctrl+C or close this Terminal window to stop it.\n", flush=True)
        try:
            webbrowser.open(url)
        except Exception:
            print("Browser did not open automatically. Copy the local URL above.", flush=True)
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            print("\nPARADOX stopped.", flush=True)


if __name__ == "__main__":
    main()
