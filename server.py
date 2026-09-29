#!/usr/bin/env python3
"""Local dev server for SteadyNote (static files, no caching)."""
import http.server, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

http.server.test(HandlerClass=NoCache, port=8650, bind="127.0.0.1")
