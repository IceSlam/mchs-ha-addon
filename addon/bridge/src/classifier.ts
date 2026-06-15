import { ClassifiedEvent, Config, NotificationPayload, AlertType } from "./types";

export function classify(payload: NotificationPayload, config: Config, now = new Date()): ClassifiedEvent {
  const message = normalize([payload.title, payload.text, payload.subText, payload.bigText].filter(Boolean).join(" "));
  const type = detectType(message, config);
  const detectedRegion = detectRegion(message, config.regions);
  const region = detectedRegion || config.region;

  return {
    type,
    region,
    regionMatches: !detectedRegion || normalize(detectedRegion) === normalize(config.region),
    message,
    raw: payload,
    seenAt: new Date(payload.timestamp || payload.postTime || now.getTime()).toISOString(),
    dedupeKey: [
      payload.packageName || payload.package || "",
      payload.notificationId ?? "",
      payload.postTime || payload.timestamp || "",
      message
    ].join("|")
  };
}

export function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function detectType(message: string, config: Config): AlertType {
  if (matchesAny(message, config.keywords.cancel)) return "cancel_alert";
  if (matchesAny(message, config.keywords.uav)) return "uav_alert";
  if (matchesAny(message, config.keywords.missile)) return "missile_alert";
  if (matchesAny(message, config.keywords.air)) return "air_alert";
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
