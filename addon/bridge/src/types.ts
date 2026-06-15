export type AlertType = "uav_alert" | "missile_alert" | "air_alert" | "cancel_alert" | "unknown";
export type AlertState = "ON" | "OFF";
export type Keywords = Record<"uav" | "missile" | "air" | "cancel", string[]>;

export type Config = {
  mqtt_host: string;
  mqtt_port: number;
  mqtt_username?: string;
  mqtt_password?: string;
  mqtt_discovery: boolean;
  discovery_prefix: string;
  region: string;
  regions: string[];
  filter_by_region: boolean;
  publish_unknown: boolean;
  retain_state: boolean;
  deduplicate_window_seconds: number;
  auto_clear_minutes: number;
  listener_http_port: number;
  keywords: Keywords;
};

export type NotificationPayload = {
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

export type ClassifiedEvent = {
  type: AlertType;
  region: string;
  regionMatches: boolean;
  message: string;
  raw: NotificationPayload;
  seenAt: string;
  dedupeKey: string;
};

export type BridgeState = {
  state: AlertState;
  type: AlertType;
  region: string;
  message: string;
  last_seen: string;
  last_event_type: AlertType;
  last_event_message: string;
  last_event_seen: string;
  listener_status: string;
  bridge_status: string;
};
