#!/usr/bin/env python3
import http.server, subprocess, os

SECRET = os.environ.get('REBOOT_SECRET', 'change-me')

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/reboot' and self.headers.get('X-Secret') == SECRET:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'rebooting')
            subprocess.Popen(['reboot'])
        else:
            self.send_response(403)
            self.end_headers()
    def log_message(self, *a): pass

http.server.HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
