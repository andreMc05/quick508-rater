#!/usr/bin/env python3
"""Tiny stdlib UI server for 508 Draft Rater."""
from __future__ import annotations

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rate import rate  # noqa: E402

PUBLIC = ROOT / "public"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            self._json({"product": "508 Draft Rater", "disclaimer": "pre-audit only"})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/rate":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        try:
            raw = body.get("html") or body.get("url")
            if not raw:
                raise ValueError("Provide url or html")
            report = rate(
                raw,
                as_html=bool(body.get("html")),
                kind=body.get("kind") or "web",
                skip_jev=bool(body.get("skipJev")),
            )
            self._json(report)
        except Exception as exc:
            self._json({"error": str(exc)}, 500)

    def _json(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write("508 Draft Rater " + (fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5080
    print(f"508 Draft Rater http://127.0.0.1:{port}")
    print("Pre-audit only. Not a conformance engine.")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
