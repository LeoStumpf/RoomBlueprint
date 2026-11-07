#!/usr/bin/env python3
"""Serves Room Blueprint and keeps its projects in one place, so that several devices share them.

There is no login: whoever can reach this server can read and change every project. It therefore listens on
this computer only. --host 0.0.0.0 opens it to the network; do that in a home network you trust, never on the internet.

Only the files in PAGES are served (no .git and the like). New files must be added there, or they return 404. The optional
local project folder (LOCAL_PAGES) is served to this computer only, and only when it exists.
Projects are kept in <data>/projects.json (GET/PUT /api/projects). A PUT has to name the version it was based on in
If-Match, so a device cannot overwrite what it has not seen; on 412 it fetches, merges and tries again.

Usage: python3 serve.py [port] [--host HOST] [--data DIR]   (default 8080, 127.0.0.1, data/ next to this file)
"""
import argparse
import hashlib
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = {
    "/": "index.html", "/index.html": "index.html", "/room-check.html": "room-check.html",
    "/compare.html": "compare.html", "/favicon.svg": "favicon.svg",
    "/css/app.css": "css/app.css", "/css/planner.css": "css/planner.css",
    "/css/analysis.css": "css/analysis.css", "/css/compare.css": "css/compare.css",
    "/demo/rooms.js": "demo/rooms.js",
    "/js/platform.js": "js/platform.js", "/js/geometry.js": "js/geometry.js",
    "/js/analyze.js": "js/analyze.js", "/js/project.js": "js/project.js",
    "/js/workspace.js": "js/workspace.js", "/js/render.js": "js/render.js", "/js/print.js": "js/print.js",
    "/js/app.js": "js/app.js", "/js/analysis-page.js": "js/analysis-page.js",
    "/js/compare-page.js": "js/compare-page.js", "/js/room-edit.js": "js/room-edit.js",
    "/js/room-editor.js": "js/room-editor.js", "/js/start.js": "js/start.js",
    "/js/catalog.js": "js/catalog.js", "/js/item-edit.js": "js/item-edit.js",
    "/js/furniture-panel.js": "js/furniture-panel.js", "/js/recommend.js": "js/recommend.js",
    "/js/dialogs.js": "js/dialogs.js",
}
# The optional local project folder (gitignored, often a link to a folder outside the repo). Served only when it exists, and
# only to this computer: the pages ask for it only there, and the server may be open to the network.
LOCAL_PAGES = {"/local/projects.js": "local/projects.js"}
LOOPBACK = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
CONTENT_TYPES = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml"}
# How platform.js recognises this server. http alone proves nothing, GitHub Pages is http too. The mark in the pages saves
# every other host a request that could only end in a 404.
INFO = {"server": "room-blueprint", "api": 1}
PAGE_MARK = b'<meta name="room-blueprint-server" content="1">'
MAX_BODY = 8 * 1024 * 1024
WRITE_LOCK = threading.Lock()


def revision(body):
    return '"' + hashlib.sha256(body).hexdigest() + '"'


def read_store(store):
    return store.read_bytes() if store.exists() else b"{}"


def valid_entry(key, entry):
    """Rough shape only, so that a stray client cannot store just anything. The browser checks every field on reading."""
    if not isinstance(entry, dict) or entry.get("id") != key:
        return False
    if "room" not in entry:  # a project that was deleted leaves this mark behind
        return isinstance(entry.get("deletedAt"), (int, float))
    return (isinstance(entry["room"], dict) and isinstance(entry.get("furniture"), list)
            and isinstance(entry.get("layouts"), list) and isinstance(entry.get("name"), str))


class Handler(BaseHTTPRequestHandler):
    timeout = 30
    projects = ROOT / "data" / "projects.json"

    def send(self, code, body, ctype, etag=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        if etag:
            self.send_header("ETag", etag)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/info":
            self.send(200, json.dumps(INFO).encode(), "application/json")
        elif path == "/api/projects":
            body = read_store(self.projects)
            self.send(200, body, "application/json", revision(body))
        elif path in PAGES or (path in LOCAL_PAGES and self.client_address[0] in LOOPBACK):
            # Read on every request, so that changes show at once
            file = ROOT / (PAGES.get(path) or LOCAL_PAGES[path])
            try:
                body = file.read_bytes()
            except FileNotFoundError:
                self.send_error(404)
                return
            if file.suffix == ".html":
                body = body.replace(b"<head>", b"<head>\n" + PAGE_MARK, 1)
            self.send(200, body, CONTENT_TYPES[file.suffix] + "; charset=utf-8")
        else:
            self.send_error(404)

    def do_PUT(self):
        path = self.path.split("?")[0]
        if path != "/api/projects":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.send_error(400)
            return
        if not 0 < length <= MAX_BODY:
            self.send_error(413)
            return
        try:
            data = json.loads(self.rfile.read(length))
        except (ValueError, RecursionError):
            self.send_error(400)
            return
        if not isinstance(data, dict) or not all(valid_entry(k, v) for k, v in data.items()):
            self.send_error(400)
            return
        try:
            # Python reads more than JSON allows (NaN, 1e999 as Infinity, lone surrogates). Stored, no client could read it back
            body = json.dumps(data, ensure_ascii=False, indent=1, allow_nan=False).encode("utf-8")
        except (ValueError, RecursionError):
            self.send_error(400)
            return
        seen = self.headers.get("If-Match")
        if seen is None:
            self.send_error(428)
            return
        with WRITE_LOCK:
            if seen != revision(read_store(self.projects)):
                self.send_error(412)
                return
            self.projects.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.projects.with_suffix(".tmp")
            tmp.write_bytes(body)
            os.replace(tmp, self.projects)
        self.send(200, b"{}", "application/json", revision(body))

    def log_message(self, *args):
        pass


def options(argv):
    parser = argparse.ArgumentParser(description="Serves Room Blueprint and shares its projects between devices.")
    parser.add_argument("port", nargs="?", type=int, default=8080)
    parser.add_argument("--host", default="127.0.0.1",
                        help="address to listen on; 0.0.0.0 opens it to the network, without any login")
    parser.add_argument("--data", type=Path, default=ROOT / "data", help="folder for projects.json")
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = options(sys.argv[1:])
    Handler.projects = args.data / "projects.json"
    print(f"Room Blueprint on http://{args.host}:{args.port}, projects in {args.data}", file=sys.stderr)
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("No login: anyone on this network can read and change the projects.", file=sys.stderr)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
