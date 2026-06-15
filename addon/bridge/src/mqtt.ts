import mqtt, { MqttClient } from "mqtt";
import { BridgeState, Config } from "./types";

const BASE_TOPIC = "mchs/alerts";

export class MqttPublisher {
  private client: MqttClient;

  constructor(private readonly config: Config) {
    const url = `mqtt://${config.mqtt_host}:${config.mqtt_port}`;
    this.client = mqtt.connect(url, {
      username: config.mqtt_username || undefined,
      password: config.mqtt_password || undefined,
      reconnectPeriod: 5000,
      will: {
        topic: `${BASE_TOPIC}/bridge_status`,
        payload: "offline",
        qos: 1,
        retain: true
      }
    });

    this.client.on("connect", () => log("mqtt connected"));
    this.client.on("error", (error) => log(`mqtt error: ${error.message}`));
  }

  async waitUntilConnected(): Promise<void> {
    if (this.client.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MQTT connection timeout")), 30000);
      this.client.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.client.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async publishBridgeOnline(): Promise<void> {
    await this.publish(`${BASE_TOPIC}/bridge_status`, "online", true);
  }

  async publishDiscovery(): Promise<void> {
    if (!this.config.mqtt_discovery) {
      log("discovery disabled");
      return;
    }

    const device = {
      identifiers: ["mchs_alert_bridge"],
      name: "MCHS Alert Bridge",
      manufacturer: "mchs-ha-addon",
      model: "Android notification MQTT bridge"
    };
    const availability = {
      topic: `${BASE_TOPIC}/bridge_status`,
      payload_available: "online",
      payload_not_available: "offline"
    };

    const configs = [
      {
        topic: `${this.config.discovery_prefix}/binary_sensor/mchs_alert/config`,
        payload: {
          name: "MCHS Alert",
          unique_id: "mchs_alert",
          state_topic: `${BASE_TOPIC}/state`,
          payload_on: "ON",
          payload_off: "OFF",
          device_class: "safety",
          availability,
          device
        }
      },
      sensorConfig(this.config, "mchs_alert_type", "MCHS Alert Type", `${BASE_TOPIC}/type`, device, availability),
      sensorConfig(this.config, "mchs_alert_region", "MCHS Alert Region", `${BASE_TOPIC}/region`, device, availability),
      sensorConfig(this.config, "mchs_alert_message", "MCHS Alert Message", `${BASE_TOPIC}/message`, device, availability),
      sensorConfig(this.config, "mchs_alert_last_seen", "MCHS Alert Last Seen", `${BASE_TOPIC}/last_seen`, device, availability),
      sensorConfig(this.config, "mchs_alert_last_event_type", "MCHS Alert Last Event Type", `${BASE_TOPIC}/last_event_type`, device, availability),
      sensorConfig(this.config, "mchs_alert_last_event_message", "MCHS Alert Last Event Message", `${BASE_TOPIC}/last_event_message`, device, availability),
      sensorConfig(this.config, "mchs_alert_last_event_seen", "MCHS Alert Last Event Seen", `${BASE_TOPIC}/last_event_seen`, device, availability),
      sensorConfig(this.config, "mchs_alert_listener_status", "MCHS Alert Listener Status", `${BASE_TOPIC}/listener_status`, device, availability),
      sensorConfig(this.config, "mchs_alert_bridge_status", "MCHS Alert Bridge Status", `${BASE_TOPIC}/bridge_status`, device, availability)
    ];

    await Promise.all(configs.map((item) => this.publish(item.topic, JSON.stringify(item.payload), true)));
    log("discovery published");
  }

  async publishState(state: BridgeState): Promise<void> {
    const retain = this.config.retain_state;
    await Promise.all([
      this.publish(`${BASE_TOPIC}/state`, state.state, retain),
      this.publish(`${BASE_TOPIC}/type`, state.type, retain),
      this.publish(`${BASE_TOPIC}/region`, state.region, retain),
      this.publish(`${BASE_TOPIC}/message`, state.message, retain),
      this.publish(`${BASE_TOPIC}/last_seen`, state.last_seen, retain),
      this.publish(`${BASE_TOPIC}/last_event_type`, state.last_event_type, retain),
      this.publish(`${BASE_TOPIC}/last_event_message`, state.last_event_message, retain),
      this.publish(`${BASE_TOPIC}/last_event_seen`, state.last_event_seen, retain),
      this.publish(`${BASE_TOPIC}/listener_status`, state.listener_status, retain),
      this.publish(`${BASE_TOPIC}/bridge_status`, state.bridge_status, true)
    ]);
  }

  async publishRaw(raw: unknown): Promise<void> {
    await this.publish(`${BASE_TOPIC}/raw`, JSON.stringify(raw), false);
  }

  private async publish(topic: string, payload: string, retain: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1, retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function sensorConfig(config: Config, uniqueId: string, name: string, stateTopic: string, device: object, availability: object) {
  return {
    topic: `${config.discovery_prefix}/sensor/${uniqueId}/config`,
    payload: {
      name,
      unique_id: uniqueId,
      state_topic: stateTopic,
      availability,
      device
    }
  };
}

function log(message: string): void {
  console.log(`[bridge] ${message}`);
}
