import { existsSync, readFileSync } from "fs";
import { Config } from "./types";

export const DEFAULT_CONFIG: Config = {
  mqtt_host: process.env.MQTT_HOST || "core-mosquitto",
  mqtt_port: Number(process.env.MQTT_PORT || 1883),
  mqtt_username: process.env.MQTT_USERNAME || "",
  mqtt_password: process.env.MQTT_PASSWORD || "",
  mqtt_discovery: true,
  discovery_prefix: "homeassistant",
  region: process.env.MCHS_REGION || "Брянская область",
  regions: ["Брянская область"],
  filter_by_region: true,
  publish_unknown: true,
  retain_state: true,
  deduplicate_window_seconds: 30,
  auto_clear_minutes: 0,
  listener_http_port: Number(process.env.LISTENER_HTTP_PORT || 8765),
  keywords: {
    uav: ["беспилотная опасность", "бпла", "угроза атаки бпла", "опасность атаки бпла"],
    missile: ["ракетная опасность", "ракетная угроза"],
    air: ["воздушная тревога", "авиационная опасность"],
    cancel: ["отбой", "опасность отменена", "отмена опасности", "отбой беспилотной опасности", "отбой ракетной опасности"]
  }
};

export function loadConfig(): Config {
  const optionsPath = process.env.CONFIG_PATH || "/data/options.json";
  if (!existsSync(optionsPath)) return DEFAULT_CONFIG;
  const parsed = JSON.parse(readFileSync(optionsPath, "utf8"));
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    regions: parsed.regions?.length ? parsed.regions : [parsed.region || DEFAULT_CONFIG.region],
    keywords: {
      ...DEFAULT_CONFIG.keywords,
      ...(parsed.keywords || {})
    }
  };
}
