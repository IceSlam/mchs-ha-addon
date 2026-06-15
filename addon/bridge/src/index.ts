import { createServer, IncomingMessage, ServerResponse } from "http";
import { classify } from "./classifier";
import { loadConfig } from "./config";
import { MqttPublisher } from "./mqtt";
import { AlertStateMachine } from "./state";
import { NotificationPayload } from "./types";

const config = loadConfig();
const mqtt = new MqttPublisher(config);
const stateMachine = new AlertStateMachine(config);

main().catch((error) => {
  console.error("[bridge] fatal error", error);
  process.exit(1);
});

async function main(): Promise<void> {
  await mqtt.waitUntilConnected();
  await mqtt.publishBridgeOnline();
  await mqtt.publishDiscovery();
  await mqtt.publishState(stateMachine.snapshot());

  if (config.auto_clear_minutes > 0) {
    setInterval(async () => {
      if (stateMachine.autoClear()) {
        log("auto clear changed state to OFF");
        await mqtt.publishState(stateMachine.snapshot());
      }
    }, 60000).unref();
  }

  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && pathname === "/status") {
        sendJson(res, 200, stateMachine.snapshot());
        return;
      }
      if (req.method === "POST" && pathname.startsWith("/test/")) {
        await handleNotification(testPayload(pathname.replace("/test/", "")), res);
        return;
      }
      if (req.method === "POST" && pathname === "/notification") {
        await handleNotification(await readJson(req), res);
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      console.error("[bridge] request failed", error);
      sendJson(res, 400, { error: "bad_request" });
    }
  });

  server.listen(config.listener_http_port, "0.0.0.0", () => {
    log(`listening on :${config.listener_http_port}`);
  });
}

async function handleNotification(payload: NotificationPayload, res: ServerResponse): Promise<void> {
  log("notification received");
  const event = classify(payload, config);
  log(`classified as ${event.type}`);
  const result = stateMachine.apply(event);
  if (result.duplicate) log("ignored duplicate notification");
  if (result.ignored && !result.duplicate) log("ignored because region mismatch");
  if (result.changed) log(`state changed to ${result.state.state}`);
  await mqtt.publishRaw(payload);
  await mqtt.publishState(result.state);
  sendJson(res, 202, { accepted: true, duplicate: result.duplicate, ignored: result.ignored, ...result.state });
}

async function readJson(req: IncomingMessage): Promise<NotificationPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function testPayload(kind: string): NotificationPayload {
  const messages: Record<string, string> = {
    uav: `Беспилотная опасность объявлена на территории ${config.region}`,
    missile: `Ракетная опасность объявлена на территории ${config.region}`,
    air: `Воздушная тревога объявлена на территории ${config.region}`,
    cancel: `Отбой ракетной опасности на территории ${config.region}`,
    unknown: `Информационное сообщение МЧС России на территории ${config.region}`
  };
  return {
    source: "bridge_test",
    package: "dev.mchsha.test",
    packageName: "dev.mchsha.test",
    title: "МЧС России",
    text: messages[kind] || messages.unknown,
    bigText: messages[kind] || messages.unknown,
    timestamp: Date.now(),
    notificationId: Math.floor(Math.random() * 1000000)
  };
}

function log(message: string): void {
  console.log(`[bridge] ${message}`);
}
