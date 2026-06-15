import { BridgeState, ClassifiedEvent, Config } from "./types";

type DedupeEntry = {
  key: string;
  seenAtMs: number;
};

export class AlertStateMachine {
  private state: BridgeState;
  private dedupe: DedupeEntry[] = [];

  constructor(private readonly config: Config, initial?: Partial<BridgeState>) {
    this.state = {
      state: "OFF",
      type: "unknown",
      region: config.region,
      message: "",
      last_seen: "",
      last_event_type: "unknown",
      last_event_message: "",
      last_event_seen: "",
      listener_status: "unknown",
      bridge_status: "online",
      ...initial
    };
  }

  snapshot(): BridgeState {
    return { ...this.state };
  }

  apply(event: ClassifiedEvent, nowMs = Date.now()): { state: BridgeState; changed: boolean; ignored: boolean; duplicate: boolean } {
    if (this.isDuplicate(event, nowMs)) {
      return { state: this.snapshot(), changed: false, ignored: true, duplicate: true };
    }

    const before = this.state.state;
    this.state.last_event_type = event.type;
    this.state.last_event_message = event.message;
    this.state.last_event_seen = event.seenAt;
    this.state.listener_status = "online";

    const regionMismatch = this.config.filter_by_region && !event.regionMatches;
    if (regionMismatch) {
      return { state: this.snapshot(), changed: false, ignored: true, duplicate: false };
    }

    if (event.type === "uav_alert" || event.type === "missile_alert" || event.type === "air_alert") {
      this.state.state = "ON";
      this.state.type = event.type;
      this.state.region = event.region;
      this.state.message = event.message;
      this.state.last_seen = event.seenAt;
    } else if (event.type === "cancel_alert") {
      this.state.state = "OFF";
      this.state.type = event.type;
      this.state.region = event.region;
      this.state.message = event.message;
      this.state.last_seen = event.seenAt;
    } else if (this.config.publish_unknown) {
      this.state.last_event_type = "unknown";
    }

    return { state: this.snapshot(), changed: before !== this.state.state, ignored: false, duplicate: false };
  }

  autoClear(now = new Date()): boolean {
    if (this.config.auto_clear_minutes <= 0 || this.state.state !== "ON" || !this.state.last_seen) return false;
    const lastSeenMs = Date.parse(this.state.last_seen);
    if (Number.isNaN(lastSeenMs)) return false;
    if (now.getTime() - lastSeenMs < this.config.auto_clear_minutes * 60000) return false;
    this.state.state = "OFF";
    this.state.type = "unknown";
    this.state.message = "auto clear";
    this.state.last_seen = now.toISOString();
    return true;
  }

  private isDuplicate(event: ClassifiedEvent, nowMs: number): boolean {
    const windowMs = this.config.deduplicate_window_seconds * 1000;
    if (windowMs <= 0) return false;
    this.dedupe = this.dedupe.filter((item) => nowMs - item.seenAtMs <= windowMs);
    if (this.dedupe.some((item) => item.key === event.dedupeKey)) return true;
    this.dedupe.push({ key: event.dedupeKey, seenAtMs: nowMs });
    return false;
  }
}
