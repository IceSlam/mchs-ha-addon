import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { ClassifiedAlert, MqttPublisher } from "./mqtt";

type Keywords = Record<"uav" | "missile" | "air" | "cancel", string[]>;

type Config = {
  mqtt_host: string;
  mqtt_port: number;
  mqtt_username?: string;
  mqtt_password?: string;
  region: string;
  regions?: string[];
  listener_http_port: number;
  keywords: Keywords;
};

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

const DEFAULT_CONFIG: Config = {
  mqtt_host: process.env.MQTT_HOST || "core-mosquitto",
  mqtt_port: Number(process.env.MQTT_PORT || 1883),
  mqtt_username: process.env.MQTT_USERNAME || "",
  mqtt_password: process.env.MQTT_PASSWORD || "",
  region: process.env.MCHS_REGION || "Брянская область",
  listener_http_port: Number(process.env.LISTENER_HTTP_PORT || 8765),
  keywords: {
    uav: ["беспилотная опасность", "БПЛА", "угроза атаки БПЛА"],
    missile: ["ракетная опасность", "ракетная угроза"],
    air: ["воздушная тревога", "авиационная опасность"],
    cancel: ["отбой", "опасность отменена", "отмена опасности"]
  }
};

const config = loadConfig();
const mqtt = new MqttPublisher(config);

main().catch((error) => {
  console.error("Fatal bridge error", error);
  process.exit(1);
});

async function main(): Promise<void> {
  await mqtt.waitUntilConnected();
  await mqtt.publishDiscovery();

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method !== "POST" || req.url !== "/notification") {
        sendJson(res, 404, { error: "not_found" });
        return;
      }

      const payload = await readJson(req);
      const alert = classify(payload);
      await mqtt.publishAlert(alert);
      sendJson(res, 202, { accepted: true, type: alert.type, state: alert.state, region: alert.region });
    } catch (error) {
      console.error("Request failed", error);
      sendJson(res, 400, { error: "bad_request" });
    }
  });

  server.listen(config.listener_http_port, "0.0.0.0", () => {
    console.log(`MCHS alert bridge listening on :${config.listener_http_port}`);
  });
}

export function classify(payload: NotificationPayload): ClassifiedAlert {
  const message = normalize([payload.title, payload.text, payload.subText, payload.bigText].filter(Boolean).join(" "));
  const type = detectType(message, config.keywords);
  const region = detectRegion(message, config.regions || [config.region]) || config.region;

  return {
    state: type === "cancel_alert" ? "OFF" : type === "unknown" ? "OFF" : "ON",
    type,
    region,
    message: message || "",
    raw: payload,
    last_seen: new Date(payload.timestamp || payload.postTime || Date.now()).toISOString()
  };
}

function detectType(message: string, keywords: Keywords): ClassifiedAlert["type"] {
  if (matchesAny(message, keywords.cancel)) return "cancel_alert";
  if (matchesAny(message, keywords.uav)) return "uav_alert";
  if (matchesAny(message, keywords.missile)) return "missile_alert";
  if (matchesAny(message, keywords.air)) return "air_alert";
  return "unknown";
}

function detectRegion(message: string, regions: string[]): string | undefined {
  const normalizedMessage = normalize(message);
  return regions.find((region) => normalizedMessage.includes(normalize(region)));
}

function matchesAny(message: string, keywords: string[]): boolean {
  const normalizedMessage = normalize(message);
  return keywords.some((keyword) => normalizedMessage.includes(normalize(keyword)));
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function loadConfig(): Config {
  const optionsPath = process.env.CONFIG_PATH || "/data/options.json";
  if (!existsSync(optionsPath)) return DEFAULT_CONFIG;
  const parsed = JSON.parse(readFileSync(optionsPath, "utf8"));
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    keywords: {
      ...DEFAULT_CONFIG.keywords,
      ...(parsed.keywords || {})
    }
  };
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
