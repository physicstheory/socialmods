# Serves two test pages on http://localhost:8765 for the Snapchat web app probe: one sent with the
# cross-origin isolation headers (COOP + COEP) that SharedArrayBuffer needs, one without.
import http.server

PAGE = """<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font:600 22px -apple-system;padding:60px 20px;line-height:1.5">
<div>%s</div><div id=r></div>
<script>
document.getElementById("r").innerHTML =
  "crossOriginIsolated: <b>" + window.crossOriginIsolated + "</b><br>" +
  "SharedArrayBuffer: <b>" + (typeof SharedArrayBuffer) + "</b><br>" +
  "secure context: <b>" + window.isSecureContext + "</b><br><small>" + navigator.userAgent + "</small>";
</script>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        isolated = self.path.startswith("/isolated")
        body = (PAGE % ("WITH isolation headers" if isolated else "WITHOUT isolation headers")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        if isolated:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.end_headers()
        self.wfile.write(body)

http.server.ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
