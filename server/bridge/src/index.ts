import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import mqtt from "mqtt";

type AlertType = "uav_alert" | "missile_alert" | "air_alert" | "cancel_alert" | "unknown";
type AlertState = "ON" | "OFF";

type NotificationPayload = {
  source?: string;
  package?: string;
  packageName?: string;
  title?: string;
  text?: string;
  subText?: string;
  bigText?: string;
  timestamp?: number;
  postTime?: number;
  notificationId?: number;
};

type AlertSnapshot = {
  state: AlertState;
  type: AlertType;
  region: string;
  message: string;
  last_seen: string;
};

type RecentEvent = {
  received_at: string;
  type: AlertType;
  message: string;
  raw: NotificationPayload;
};

const config = {
  token: process.env.API_TOKEN || "",
  region: process.env.REGION || "Брянская область",
  regions: (process.env.REGIONS || process.env.REGION || "Брянская область").split(",").map((item) => item.trim()).filter(Boolean),
  requireGms: (process.env.REQUIRE_GMS || "true") === "true",
  adbHost: process.env.ADB_HOST || "redroid",
  adbPort: process.env.ADB_PORT || "5555",
  httpPort: Number(process.env.HTTP_PORT || 8765),
  mqttUrl: process.env.MQTT_URL || "",
  mqttUsername: process.env.MQTT_USERNAME || "",
  mqttPassword: process.env.MQTT_PASSWORD || ""
};

const keywords = {
  uav: ["беспилотная опасность", "бпла", "угроза атаки бпла", "опасность атаки бпла"],
  missile: ["ракетная опасность", "ракетная угроза"],
  air: ["воздушная тревога", "авиационная опасность"],
  cancel: ["отбой", "опасность отменена", "отмена опасности", "отбой беспилотной опасности", "отбой ракетной опасности"]
};

const stateDir = "/data/state";
const apkDir = "/data/apks";
mkdirSync(stateDir, { recursive: true });
mkdirSync(join(apkDir, "listener"), { recursive: true });
mkdirSync(join(apkDir, "mchs"), { recursive: true });

let alert: AlertSnapshot = { state: "OFF", type: "unknown", region: config.region, message: "", last_seen: "" };
const recentEvents: RecentEvent[] = [];
const sseClients = new Set<ServerResponse>();
const mqttClient = config.mqttUrl
  ? mqtt.connect(config.mqttUrl, { username: config.mqttUsername || undefined, password: config.mqttPassword || undefined })
  : undefined;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname.startsWith("/api/") && !authorized(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/") return sendHtml(res, renderHome(await buildStatus()));
    if (req.method === "GET" && url.pathname === "/api/status") return sendJson(res, 200, await buildStatus());
    if (req.method === "GET" && url.pathname === "/api/alert") return sendJson(res, 200, alert);
    if (req.method === "GET" && url.pathname === "/api/system/gms") return sendJson(res, 200, await gmsStatus());
    if (req.method === "GET" && url.pathname === "/api/events/recent") return sendJson(res, 200, recentEvents);
    if (req.method === "GET" && url.pathname === "/api/events/stream") return sse(req, res);
    if (req.method === "GET" && url.pathname === "/android-ui") return sendHtml(res, renderAndroidUi(await androidStatus()));
    if (req.method === "GET" && url.pathname === "/android-ui/screenshot.png") return androidScreenshot(res);

    if (req.method === "POST" && url.pathname === "/notification") return handleNotification(await readJson(req) as NotificationPayload, res);
    if (req.method === "POST" && url.pathname === "/api/test/uav") return handleNotification(testPayload("uav"), res);
    if (req.method === "POST" && url.pathname === "/api/test/cancel") return handleNotification(testPayload("cancel"), res);
    if (req.method === "POST" && url.pathname === "/api/provision") return runProvisioning(res);
    if (req.method === "POST" && url.pathname === "/api/android/open-notification-access") return adbAction(res, ["shell", "am", "start", "-a", "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"]);
    if (req.method === "POST" && url.pathname === "/api/android/open-mchs") return openMchs(res);
    if (req.method === "POST" && url.pathname === "/api/android/tap") {
      const body = await readJson(req) as { x?: number; y?: number };
      return adbAction(res, ["shell", "input", "tap", String(body.x || 0), String(body.y || 0)]);
    }
    if (req.method === "POST" && url.pathname === "/api/android/text") {
      const body = await readJson(req) as { text?: string };
      return adbAction(res, ["shell", "input", "text", String(body.text || "").replace(/\s/g, "%s")]);
    }
    if (req.method === "POST" && url.pathname === "/upload/mchs") return saveUpload(req, res, join(apkDir, "mchs", "mchs.apk"));
    if (req.method === "POST" && url.pathname === "/upload/listener") return saveUpload(req, res, join(apkDir, "listener", "mchs-listener.apk"));

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    console.error("[server] request failed", error);
    sendJson(res, 500, { error: "internal_error", message: String(error) });
  }
});

server.listen(config.httpPort, "0.0.0.0", () => console.log(`[server] listening on ${config.httpPort}`));

function authorized(req: IncomingMessage): boolean {
  if (!config.token || config.token === "change-me") return true;
  return req.headers.authorization === `Bearer ${config.token}`;
}

async function handleNotification(payload: NotificationPayload, res: ServerResponse): Promise<void> {
  const event = classify(payload);
  recentEvents.unshift({ received_at: new Date().toISOString(), type: event.type, message: event.message, raw: payload });
  recentEvents.splice(50);
  if (event.type === "uav_alert" || event.type === "missile_alert" || event.type === "air_alert") {
    alert = { state: "ON", type: event.type, region: event.region, message: event.message, last_seen: event.seenAt };
  } else if (event.type === "cancel_alert") {
    alert = { state: "OFF", type: event.type, region: event.region, message: event.message, last_seen: event.seenAt };
  }
  writeFileSync(join(stateDir, "alert.json"), JSON.stringify(alert, null, 2));
  publishMqtt();
  emitSse("alert", alert);
  sendJson(res, 202, { accepted: true, alert });
}

function classify(payload: NotificationPayload): { type: AlertType; region: string; message: string; seenAt: string } {
  const message = normalize([payload.title, payload.text, payload.subText, payload.bigText].filter(Boolean).join(" "));
  const type = matches(message, keywords.cancel) ? "cancel_alert"
    : matches(message, keywords.uav) ? "uav_alert"
    : matches(message, keywords.missile) ? "missile_alert"
    : matches(message, keywords.air) ? "air_alert"
    : "unknown";
  const region = config.regions.find((item) => message.includes(normalize(item))) || config.region;
  return { type, region, message, seenAt: new Date(payload.timestamp || payload.postTime || Date.now()).toISOString() };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function matches(message: string, words: string[]): boolean {
  return words.some((word) => message.includes(normalize(word)));
}

async function buildStatus(): Promise<object> {
  return {
    ok: true,
    server: "online",
    android: await androidStatus(),
    alert
  };
}

async function androidStatus(): Promise<object> {
  const adb = await adbOnline();
  const boot = adb ? (await adbShell(["getprop", "sys.boot_completed"])).trim() === "1" : false;
  const gms = await gmsStatus();
  const listener = adb ? await packageInstalled("dev.mchsha.listener") : "unknown";
  const mchs = adb ? await findMchsPackage() : "unknown";
  return { status: adb && boot ? "online" : adb ? "booting" : "offline", adb: adb ? "online" : "offline", boot_completed: boot, gms: gms.status, listener, mchs };
}

async function gmsStatus(): Promise<{ status: string; packages: string[] }> {
  if (!(await adbOnline())) return { status: "unknown", packages: [] };
  const packages = (await adbShell(["pm", "list", "packages", "com.google.android.gms"]))
    .split("\n").map((line) => line.replace("package:", "").trim()).filter(Boolean);
  const vending = (await adbShell(["pm", "list", "packages", "com.android.vending"]))
    .split("\n").map((line) => line.replace("package:", "").trim()).filter(Boolean);
  return { status: packages.includes("com.google.android.gms") ? "installed" : "missing", packages: [...packages, ...vending] };
}

async function packageInstalled(pkg: string): Promise<string> {
  const out = await adbShell(["pm", "path", pkg]);
  return out.includes(pkg) ? "installed" : "missing";
}

async function findMchsPackage(): Promise<string> {
  for (const pkg of ["ru.mchs", "ru.mchs.app", "ru.mchs.mobile", "ru.mchs.informer", "io.citizens.security"]) {
    if (await packageInstalled(pkg) === "installed") return "installed";
  }
  return "missing";
}

async function adbOnline(): Promise<boolean> {
  await exec("adb", ["connect", `${config.adbHost}:${config.adbPort}`], 3000);
  const out = await exec("adb", ["-s", `${config.adbHost}:${config.adbPort}`, "get-state"], 3000);
  return out.trim() === "device";
}

async function adbShell(args: string[]): Promise<string> {
  return exec("adb", ["-s", `${config.adbHost}:${config.adbPort}`, "shell", ...args], 5000);
}

async function adbAction(res: ServerResponse, args: string[]): Promise<void> {
  if (!(await adbOnline())) return sendJson(res, 503, { error: "android_offline" });
  const out = await exec("adb", ["-s", `${config.adbHost}:${config.adbPort}`, ...args], 10000);
  sendJson(res, 200, { ok: true, output: out });
}

async function openMchs(res: ServerResponse): Promise<void> {
  for (const pkg of ["ru.mchs", "ru.mchs.app", "ru.mchs.mobile", "ru.mchs.informer", "io.citizens.security"]) {
    if (await packageInstalled(pkg) === "installed") return adbAction(res, ["shell", "monkey", "-p", pkg, "1"]);
  }
  sendJson(res, 404, { error: "mchs_app_missing" });
}

async function androidScreenshot(res: ServerResponse): Promise<void> {
  if (!(await adbOnline())) return sendJson(res, 503, { error: "android_offline" });
  const chunks = await execBuffer("adb", ["-s", `${config.adbHost}:${config.adbPort}`, "exec-out", "screencap", "-p"], 10000);
  res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
  res.end(chunks);
}

async function runProvisioning(res: ServerResponse): Promise<void> {
  const out = await exec("bash", ["/opt/mchs-provisioning/provision.sh"], 120000);
  sendJson(res, 200, { ok: true, output: out });
}

function sse(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  sseClients.add(res);
  res.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
  res.on("close", () => sseClients.delete(res));
}

function emitSse(event: string, data: unknown): void {
  for (const client of sseClients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function publishMqtt(): void {
  if (!mqttClient) return;
  mqttClient.publish("mchs/alerts/state", alert.state, { retain: true });
  mqttClient.publish("mchs/alerts/type", alert.type, { retain: true });
  mqttClient.publish("mchs/alerts/region", alert.region, { retain: true });
  mqttClient.publish("mchs/alerts/message", alert.message, { retain: true });
  mqttClient.publish("mchs/alerts/last_seen", alert.last_seen, { retain: true });
}

async function saveUpload(req: IncomingMessage, res: ServerResponse, target: string): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  writeFileSync(target, Buffer.concat(chunks));
  sendJson(res, 200, { ok: true, path: target });
}

async function readJson(req: IncomingMessage): Promise<NotificationPayload | object> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function renderHome(status: object): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>MCHS Alert Server</title></head><body>
  <h1>MCHS Alert Server</h1>
  <pre>${escapeHtml(JSON.stringify(status, null, 2))}</pre>
  <p><a href="android-ui">Open Android UI</a></p>
  <form method="post" action="/api/provision"><button>Run provisioning</button></form>
  <form method="post" action="/api/android/open-notification-access"><button>Open notification access</button></form>
  <form method="post" action="/api/android/open-mchs"><button>Open MCHS app</button></form>
  <form method="post" action="/api/test/uav"><button>Send test UAV</button></form>
  <form method="post" action="/api/test/cancel"><button>Send test cancel</button></form>
  <h2>Upload APKs</h2>
  <label>MCHS APK <input id="mchs-apk" type="file" accept=".apk"></label>
  <button type="button" onclick="uploadApk('mchs-apk','upload/mchs')">Upload MCHS APK</button>
  <br>
  <label>Listener APK <input id="listener-apk" type="file" accept=".apk"></label>
  <button type="button" onclick="uploadApk('listener-apk','upload/listener')">Upload Listener APK</button>
  <pre id="upload-status"></pre>
  <script>
    async function uploadApk(inputId, path) {
      const file = document.getElementById(inputId).files[0];
      if (!file) return;
      const response = await fetch(path, { method: "POST", body: await file.arrayBuffer() });
      document.getElementById("upload-status").textContent = await response.text();
    }
  </script>
  </body></html>`;
}

function renderAndroidUi(status: object): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Android UI</title></head><body>
  <h1>Android UI</h1><pre>${escapeHtml(JSON.stringify(status, null, 2))}</pre>
  <img src="android-ui/screenshot.png?ts=${Date.now()}" style="max-width:420px;width:100%;border:1px solid #999" onerror="this.replaceWith(document.createTextNode('Android screenshot is unavailable while ADB is offline.'))">
  <p>ADB screenshot fallback is available. Use provisioning buttons on the dashboard for setup actions.</p>
  <p><a href=".">Back</a></p></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

function testPayload(kind: string): NotificationPayload {
  const text = kind === "cancel" ? `Отбой ракетной опасности ${config.region}` : `Беспилотная опасность объявлена на территории ${config.region}`;
  return { source: "test", packageName: "test", title: "МЧС России", text, bigText: text, timestamp: Date.now(), notificationId: Math.floor(Math.random() * 1000000) };
}

function exec(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks.concat(errors)).toString("utf8"));
    });
    child.on("error", (error) => resolve(String(error)));
  });
}

function execBuffer(cmd: string, args: string[], timeout: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(Buffer.concat(errors).toString("utf8")));
    });
    child.on("error", reject);
  });
}
