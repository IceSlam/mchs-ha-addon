#!/usr/bin/env python3
from __future__ import annotations

import cgi
import html
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

UPLOAD_DIR = Path("/data/uploads")
MCHS_APK = UPLOAD_DIR / "mchs.apk"


def run(cmd: list[str], timeout: int = 20) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    except Exception as exc:
        return 1, str(exc)


def status() -> dict:
    code, out = run(["/opt/mchs-redroid/manager.sh", "health"], timeout=10)
    redroid = {}
    if code == 0:
        try:
            redroid = json.loads(out)
        except json.JSONDecodeError:
            redroid = {"error": out}
    else:
        redroid = {"error": out}

    gms = run(["adb", "-s", "127.0.0.1:5555", "shell", "pm", "path", "com.google.android.gms"], timeout=5)[0] == 0
    listener = run(["adb", "-s", "127.0.0.1:5555", "shell", "pm", "path", "dev.mchsha.listener"], timeout=5)[0] == 0
    return {
        "redroid": redroid,
        "google_play_services": "present" if gms else "missing",
        "listener": "installed" if listener else "missing",
        "uploaded_mchs_apk": MCHS_APK.exists(),
        "android_display": "not_configured"
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/status.json":
            self.send_json(status())
            return
        self.send_html(self.render())

    def do_POST(self) -> None:
        if self.path == "/upload-mchs":
            self.upload_mchs()
            return
        if self.path == "/provision":
            self.command(["/opt/mchs-provisioning/provision.sh"], timeout=300)
            return
        if self.path == "/restart-redroid":
            self.command(["/opt/mchs-redroid/manager.sh", "restart"], timeout=360)
            return
        if self.path == "/open-notification-access":
            self.command(["adb", "-s", "127.0.0.1:5555", "shell", "am", "start", "-a", "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"])
            return
        self.send_error(404)

    def upload_mchs(self) -> None:
        ctype, pdict = cgi.parse_header(self.headers.get("content-type", ""))
        if ctype != "multipart/form-data":
            self.send_error(400, "multipart/form-data required")
            return
        pdict["boundary"] = bytes(pdict["boundary"], "utf-8")
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        item = form["apk"] if "apk" in form else None
        if item is None or not item.file:
            self.send_error(400, "apk file required")
            return
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        MCHS_APK.write_bytes(item.file.read())
        self.redirect("/")

    def command(self, cmd: list[str], timeout: int = 60) -> None:
        code, out = run(cmd, timeout=timeout)
        self.send_html(f"<pre>{html.escape(out)}</pre><p>Exit code: {code}</p><p><a href='/'>Back</a></p>")

    def render(self) -> str:
        data = status()
        return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCHS Alert</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 24px; max-width: 960px; }}
    code, pre {{ background: #f4f4f4; padding: 8px; display: block; overflow: auto; }}
    button {{ margin: 4px 8px 4px 0; padding: 8px 12px; }}
  </style>
</head>
<body>
  <h1>MCHS Alert Add-on</h1>
  <p>This UI manages Redroid provisioning. Android graphical access requires a scrcpy/noVNC backend compatible with the host kernel and is reported below.</p>
  <pre>{html.escape(json.dumps(data, ensure_ascii=False, indent=2))}</pre>
  <form method="post" action="/restart-redroid"><button>Restart Redroid</button></form>
  <form method="post" action="/provision"><button>Run Provisioning</button></form>
  <form method="post" action="/open-notification-access"><button>Open Notification Access in Android</button></form>
  <h2>Install MCHS APK</h2>
  <form method="post" action="/upload-mchs" enctype="multipart/form-data">
    <input type="file" name="apk" accept=".apk">
    <button>Upload APK</button>
  </form>
</body>
</html>"""

    def send_json(self, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, body: str) -> None:
        raw = body.encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def redirect(self, location: str) -> None:
        self.send_response(303)
        self.send_header("location", location)
        self.end_headers()


def main() -> None:
    port = int(os.environ.get("WEBUI_PORT", "8099"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
