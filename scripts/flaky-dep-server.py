#!/usr/bin/env python3
"""A dependency that fails twice and then succeeds — the esm.sh cold start, on localhost.

`GenUISurface`'s retry appends `&ui4a-retry=<n>` to every fetched import URL, because the module
registry caches a failed `import()` as a rejection for the page's lifetime and re-importing the
same URL never touches the network. Proving that *matters* needs a dependency that fails
transiently: a permanently-missing module makes the old and new code look equally broken.

    python3 scripts/flaky-dep-server.py     # serves on 47795
    # /      the fixed retry (busted URL per attempt)  -> 3 requests, RECOVERED
    # /old   the pre-fix retry (same URL every time)   -> 1 request,  NEVER RECOVERED
    # /hits  how many requests /dep.js has really seen

Threaded on purpose: a single-threaded server deadlocks the moment the page fetches `/hits`
while the browser still holds the HTML connection open.
"""
import http.server, os, socketserver, threading, time
# A dependency that fails the first two times and succeeds after — a real esm.sh cold start.
hits = {"n": 0}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/dep.js":
            hits["n"] += 1
            if hits["n"] <= 2:
                self.send_response(503); self.end_headers(); return
            body = b"export const ready = true\n"
            self.send_response(200); self.send_header("content-type", "text/javascript")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/hits":
            body = str(hits["n"]).encode()
            self.send_response(200); self.send_header("content-type", "text/plain")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/old":
            body = open(os.path.join(os.path.dirname(__file__), "flaky-dep-old.html"), "rb").read()
            self.send_response(200); self.send_header("content-type", "text/html")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path == "/":
            body = open(os.path.join(os.path.dirname(__file__), "flaky-dep-new.html"), "rb").read()
            self.send_response(200); self.send_header("content-type", "text/html")
            self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        self.send_response(404); self.end_headers()
socketserver.ThreadingTCPServer.allow_reuse_address = True
s = socketserver.ThreadingTCPServer(("127.0.0.1", 47795), H)
threading.Thread(target=s.serve_forever, daemon=True).start()
print("flaky server on 47795")
time.sleep(600)
