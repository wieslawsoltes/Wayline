#!/usr/bin/env python3
"""Serve Wayline on a secure-context eligible loopback origin. Ctrl-C stops it."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import argparse
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8080)
parser.add_argument('--host', default='127.0.0.1', help='Default is loopback only.')
args = parser.parse_args()
handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
try:
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f'Wayline: http://{args.host}:{args.port}', flush=True)
        server.serve_forever()
except KeyboardInterrupt:
    pass
