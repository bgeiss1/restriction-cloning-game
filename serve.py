#!/usr/bin/env python3
"""Simple HTTP server for Sticky Ends."""

import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

if __name__ == "__main__":
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving Sticky Ends at:")
        print(f"  http://10.2.35.64:{PORT}/index.html")
        print(f"  http://localhost:{PORT}/index.html")
        print(f"Press Ctrl+C to stop.")
        httpd.serve_forever()
