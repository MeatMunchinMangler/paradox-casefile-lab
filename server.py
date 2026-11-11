"""PARADOX: localhost-only original mystery game; zero external dependencies.

Only seven explicitly registered static paths may be read. No form submissions,
accounts, analytics, messages, persistence or external network are supported.
The listening socket is restricted to 127.0.0.1. This is not public hosting.
"""
from __future__ import annotations

import argparse
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import mimetypes

ROOT = Path(__file__).resolve().parent
ALLOWED = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/style.css": "style.css",
    "/favicon.svg": "favicon.svg",
    "/data/cases.json": "data/cases.json",
    "/manifest.webmanifest": "manifest.webmanifest",
    "/privacy.html": "privacy.html",
}

class ParadoxHandler(BaseHTTPRequestHandler):
    server_version = "ParadoxLocal/0.1"
    sys_version = ""

    def _serve(self, send_body=True):
        path = urlsplit(self.path).path
        relative = ALLOWED.get(path)
        if relative is None:
            self._text_error(404)
            return
        destination = (ROOT / relative).resolve()
        if not destination.is_relative_to(ROOT):
            self._text_error(404)
            return
        try:
            payload = destination.read_bytes()
        except OSError:
            self._text_error(404)
            return
        content_type = mimetypes.guess_type(destination.name)[0] or "application/octet-stream"
        if destination.name.endswith(".json") or destination.suffix == ".webmanifest":
            content_type = "application/json"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"
        self.send_response(200)
        self._headers(content_type, len(payload))
        self.end_headers()
        if send_body:
            self.wfile.write(payload)

    def _headers(self, content_type, length):
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        self.send_header("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'none'")

    def _text_error(self, status):
        payload = b"Not available.\n"
        self.send_response(status)
        self._headers("text/plain; charset=utf-8", len(payload))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_GET(self):
        self._serve()

    def do_HEAD(self):
        self._serve(send_body=False)

    def do_POST(self):
        self._text_error(405)

    def do_PUT(self):
        self._text_error(405)

    def do_DELETE(self):
        self._text_error(405)

    def log_message(self, *args):
        # Do not log case share parameters or a person's local activity.
        return


def make_server(port=0):
    if not isinstance(port, int) or not 0 <= port <= 65535:
        raise ValueError("Port must be in 0..65535")
    return ThreadingHTTPServer(("127.0.0.1", port), ParadoxHandler)


def main():
    parser = argparse.ArgumentParser(description="Launch PARADOX on the Mac only.")
    parser.add_argument("--port", type=int, default=0, help="127.0.0.1 port (0 picks an available ephemeral port)")
    args = parser.parse_args()
    with make_server(args.port) as server:
        print("PARADOX_LOCAL_URL=http://127.0.0.1:%d/" % server.server_port, flush=True)
        print("This is a local-only, synthetic demo; no public hosting or payments.", flush=True)
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            print("PARADOX_STOPPED", flush=True)


if __name__ == "__main__":
    main()
