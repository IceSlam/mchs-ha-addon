#!/usr/bin/env python3
from __future__ import annotations

import cgi
import html
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

UPLOAD_DIR = Path("/data/uploads")
STATUS_DIR = Path("/data/status")
MCHS_APK = UPLOAD_DIR / "mchs.apk"
LISTENER_APK = UPLOAD_DIR / "mchs-listener.apk"
BUNDLED_LISTENER_APK = Path("/opt/mchs-provisioning/apks/mchs-listener.apk")


def run(cmd: list[str], timeout: int = 20) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    except Exception as exc:
        return 1, str(exc)


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        return {"error": str(exc)}


def package_present(package_name: str) -> bool:
    return run(["adb", "-s", "127.0.0.1:5555", "shell", "pm", "path", package_name], timeout=5)[0] == 0


def notification_access() -> str:
    code, out = run(["adb", "-s", "127.0.0.1:5555", "shell", "settings", "get", "secure", "enabled_notification_listeners"], timeout=5)
    if code != 0:
        return "unknown"
    return "enabled" if "dev.mchsha.listener" in out else "not_enabled"


def mchs_package() -> str:
    for pkg in ["ru.mchs", "ru.mchs.app", "ru.mchs.mobile", "ru.mchs.informer", "io.citizens.security"]:
        if package_present(pkg):
            return pkg
    return ""


def android_ui_status() -> str:
    if os.environ.get("ANDROID_UI_URL"):
        return os.environ["ANDROID_UI_URL"]
    return "adb_screenshot_control"


def android_ui_status_payload() -> dict:
    data = status()
    backend = android_ui_status()
    boot_completed = str(data.get("android_boot", "0")) == "1"
    adb = data.get("adb", "unknown")
    redroid = data.get("redroid", {}).get("redroid", "unknown") if isinstance(data.get("redroid"), dict) else "unknown"
    if backend.startswith("http://") or backend.startswith("https://"):
        return {
            "available": True,
            "backend": "external",
            "url": backend,
            "redroid": redroid,
            "adb": adb,
            "boot_completed": boot_completed,
            "message": "External Android UI backend configured"
        }
    return {
        "available": adb == "connected" and boot_completed,
        "backend": "adb_screenshot_control",
        "url": "android-ui",
        "redroid": redroid,
        "adb": adb,
        "boot_completed": boot_completed,
        "message": "Built-in ADB screenshot/tap Android UI"
    }


def status() -> dict:
    code, out = run(["/opt/mchs-redroid/manager.sh", "health"], timeout=10)
    if code == 0:
        try:
            redroid = json.loads(out)
        except json.JSONDecodeError:
            redroid = {"error": out}
    else:
        redroid = {"error": out}

    provisioning = read_json(STATUS_DIR / "provisioning.json")
    return {
        "bridge": http_json("http://127.0.0.1:8765/status"),
        "redroid": redroid,
        "adb": redroid.get("adb", "unknown"),
        "android_boot": redroid.get("boot_completed", "0"),
        "kernel": redroid.get("kernel", read_json(STATUS_DIR / "kernel.json")),
        "google_play_services": "present" if package_present("com.google.android.gms") else "missing",
        "listener_apk": "bundled" if BUNDLED_LISTENER_APK.exists() else ("uploaded" if LISTENER_APK.exists() else "missing"),
        "listener": "installed" if package_present("dev.mchsha.listener") else "missing",
        "mchs_apk_uploaded": MCHS_APK.exists(),
        "mchs_package": mchs_package() or "missing",
        "notification_access": notification_access(),
        "provisioning": provisioning,
        "android_ui": android_ui_status(),
        "last_notification": read_json(STATUS_DIR / "last_notification.json"),
        "last_alert": http_json("http://127.0.0.1:8765/status")
    }


def http_json(url: str) -> dict:
    code, out = run(["curl", "-fsS", url], timeout=5)
    if code != 0:
        return {"status": "unavailable", "error": out}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"raw": out}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/status.json":
            self.send_json(status())
            return
        if path == "/api/android-ui/status":
            self.send_json(android_ui_status_payload())
            return
        if path in ("/android", "/android-ui"):
            self.send_html(self.android_ui_page())
            return
        if path in ("/android/screenshot.png", "/android-ui/screenshot.png"):
            self.android_screenshot()
            return
        self.send_html(self.render())

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        routes = {
            "/start-redroid": (["/opt/mchs-redroid/manager.sh", "start"], 60),
            "/restart-redroid": (["/opt/mchs-redroid/manager.sh", "restart"], 360),
            "/provision": (["/opt/mchs-provisioning/provision.sh"], 300),
            "/open-notification-access": (["adb", "-s", "127.0.0.1:5555", "shell", "am", "start", "-a", "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"], 20),
            "/open-mchs": (["sh", "-c", "pkg=$(cat /data/status/provisioning.json 2>/dev/null | jq -r '.mchs_package // empty'); [ -n \"$pkg\" ] && adb -s 127.0.0.1:5555 shell monkey -p \"$pkg\" 1"], 20),
            "/test-uav": (["curl", "-fsS", "-X", "POST", "http://127.0.0.1:8765/test/uav"], 10),
            "/test-cancel": (["curl", "-fsS", "-X", "POST", "http://127.0.0.1:8765/test/cancel"], 10),
        }
        if path == "/upload-mchs":
            self.upload_apk(MCHS_APK)
            return
        if path == "/upload-listener":
            self.upload_apk(LISTENER_APK)
            return
        if path in ("/android/tap", "/android-ui/tap"):
            self.android_tap()
            return
        if path in ("/android/text", "/android-ui/text"):
            self.android_text()
            return
        if path in ("/android/key/back", "/android-ui/key/back"):
            self.command(["adb", "-s", "127.0.0.1:5555", "shell", "input", "keyevent", "4"], timeout=10)
            return
        if path in ("/android/key/home", "/android-ui/key/home"):
            self.command(["adb", "-s", "127.0.0.1:5555", "shell", "input", "keyevent", "3"], timeout=10)
            return
        if path in routes:
            cmd, timeout = routes[path]
            self.command(cmd, timeout=timeout)
            return
        self.send_error(404)

    def upload_apk(self, target: Path) -> None:
        ctype, pdict = cgi.parse_header(self.headers.get("content-type", ""))
        if ctype != "multipart/form-data":
            self.send_error(400, "multipart/form-data required")
            return
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        item = form["apk"] if "apk" in form else None
        if item is None or not item.file:
            self.send_error(400, "apk file required")
            return
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        target.write_bytes(item.file.read())
        self.redirect(".")

    def command(self, cmd: list[str], timeout: int = 60) -> None:
        code, out = run(cmd, timeout=timeout)
        self.send_html(f"<pre>{html.escape(out)}</pre><p>Exit code: {code}</p><p><a href='.'>Back</a></p>")

    def android_ui_page(self) -> str:
        payload = android_ui_status_payload()
        if payload["backend"] == "external":
            url = html.escape(payload["url"])
            return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Android UI</title></head>
<body>
  <h1>Android UI</h1>
  <iframe src="{url}" style="width:100%;height:90vh;border:0"></iframe>
  <p><a href=".">Back to add-on UI</a></p>
</body></html>"""

        data = status()
        disabled = "" if payload["available"] else "disabled"
        diagnostics = html.escape(json.dumps({"redroid": data.get("redroid"), "provisioning": data.get("provisioning")}, ensure_ascii=False, indent=2))
        return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Android UI</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 16px; }}
    #screen {{ max-width: 420px; width: 100%; border: 1px solid #999; touch-action: manipulation; }}
    button {{ margin: 4px; padding: 8px 12px; }}
    input {{ padding: 8px; min-width: 280px; }}
  </style>
</head>
<body>
  <h1>Android UI</h1>
  <p>Click the screenshot to tap Android. Use Refresh after each action.</p>
  <pre>{html.escape(json.dumps(payload, ensure_ascii=False, indent=2))}</pre>
  <pre>{diagnostics}</pre>
  <p>
    <button onclick="refresh()">Refresh status</button>
    <button onclick="post('android-ui/key/back')" {disabled}>Back</button>
    <button onclick="post('android-ui/key/home')" {disabled}>Home</button>
  </p>
  <p>
    <input id="text" placeholder="Text input">
    <button onclick="sendText()" {disabled}>Send text</button>
  </p>
  <p>
    <form method="post" action="restart-redroid"><button>Restart Redroid</button></form>
    <form method="post" action="open-notification-access"><button>Open Notification Access settings via ADB</button></form>
    <form method="post" action="open-mchs"><button>Open MCHS app via ADB</button></form>
    <form method="post" action="provision"><button>Run Provisioning</button></form>
  </p>
  <img id="screen" src="android-ui/screenshot.png?ts=0" onclick="tap(event)" alt="Android screenshot">
  <p><a href=".">Back to add-on UI</a></p>
  <script>
    function refresh() {{
      document.getElementById('screen').src = 'android-ui/screenshot.png?ts=' + Date.now();
    }}
    async function post(url, body) {{
      await fetch(url, {{method: 'POST', headers: {{'content-type': 'application/json'}}, body: body ? JSON.stringify(body) : '{{}}'}});
      setTimeout(refresh, 500);
    }}
    function tap(ev) {{
      const img = ev.currentTarget;
      const rect = img.getBoundingClientRect();
      const x = Math.round((ev.clientX - rect.left) * img.naturalWidth / rect.width);
      const y = Math.round((ev.clientY - rect.top) * img.naturalHeight / rect.height);
      post('android-ui/tap', {{x, y}});
    }}
    function sendText() {{
      post('android-ui/text', {{text: document.getElementById('text').value}});
    }}
  </script>
</body>
</html>"""

    def android_screenshot(self) -> None:
        proc = subprocess.run(["adb", "-s", "127.0.0.1:5555", "exec-out", "screencap", "-p"], capture_output=True, timeout=10)
        if proc.returncode != 0:
            self.send_error(503, proc.stderr.decode(errors="ignore"))
            return
        self.send_response(200)
        self.send_header("content-type", "image/png")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(proc.stdout)))
        self.end_headers()
        self.wfile.write(proc.stdout)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("content-length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def android_tap(self) -> None:
        body = self.read_json_body()
        x = str(int(body.get("x", 0)))
        y = str(int(body.get("y", 0)))
        self.command(["adb", "-s", "127.0.0.1:5555", "shell", "input", "tap", x, y], timeout=10)

    def android_text(self) -> None:
        body = self.read_json_body()
        text = str(body.get("text", "")).replace(" ", "%s")
        self.command(["adb", "-s", "127.0.0.1:5555", "shell", "input", "text", text], timeout=10)

    def render(self) -> str:
        data = status()
        return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCHS Alert</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 24px; max-width: 1100px; }}
    pre {{ background: #f4f4f4; padding: 12px; overflow: auto; }}
    form {{ display: inline-block; margin: 4px 8px 4px 0; }}
    button {{ padding: 8px 12px; }}
    .warn {{ color: #8a4b00; }}
  </style>
</head>
<body>
  <h1>MCHS Alert Add-on</h1>
  <p class="warn">Google Play Services status: {html.escape(data["google_play_services"])}. Push notifications may not work without GMS/FCM.</p>
  <p><a href="android-ui">Open Android UI</a> (ADB screenshot/tap/text browser control)</p>
  <pre>{html.escape(json.dumps(data, ensure_ascii=False, indent=2))}</pre>
  <form method="post" action="start-redroid"><button>Start Android</button></form>
  <form method="post" action="restart-redroid"><button>Restart Android</button></form>
  <form method="post" action="provision"><button>Run Provisioning</button></form>
  <form method="post" action="open-notification-access"><button>Open Notification Access settings</button></form>
  <form method="post" action="open-mchs"><button>Open MCHS app</button></form>
  <form method="post" action="test-uav"><button>Send test UAV alert</button></form>
  <form method="post" action="test-cancel"><button>Send test cancel alert</button></form>

  <h2>Upload APKs</h2>
  <form method="post" action="upload-mchs" enctype="multipart/form-data">
    <label>MCHS APK <input type="file" name="apk" accept=".apk"></label>
    <button>Upload MCHS APK</button>
  </form>
  <form method="post" action="upload-listener" enctype="multipart/form-data">
    <label>Listener APK <input type="file" name="apk" accept=".apk"></label>
    <button>Upload Listener APK</button>
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
