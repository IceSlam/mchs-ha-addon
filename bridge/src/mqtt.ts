import mqtt, { MqttClient } from "mqtt";

export type BridgeConfig = {
  mqtt_host: string;
  mqtt_port: number;
  mqtt_username?: string;
  mqtt_password?: string;
  discovery_prefix?: string;
};

export type ClassifiedAlert = {
  state: "ON" | "OFF";
  type: "uav_alert" | "missile_alert" | "air_alert" | "cancel_alert" | "unknown";
  region: string;
  message: string;
  raw: unknown;
  last_seen: string;
};

const BASE_TOPIC = "mchs/alerts";

export class MqttPublisher {
  private client: MqttClient;
  private discoveryPrefix: string;

  constructor(private readonly config: BridgeConfig) {
    this.discoveryPrefix = config.discovery_prefix || "homeassistant";
    const url = `mqtt://${config.mqtt_host}:${config.mqtt_port}`;
    this.client = mqtt.connect(url, {
      username: config.mqtt_username || undefined,
      password: config.mqtt_password || undefined,
      reconnectPeriod: 5000
    });
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

  async publishDiscovery(): Promise<void> {
    const device = {
      identifiers: ["mchs_alert_bridge"],
      name: "MCHS Alert Bridge",
      manufacturer: "mchs-ha-addon",
      model: "Android notification MQTT bridge"
    };

    const configs = [
      {
        topic: `${this.discoveryPrefix}/binary_sensor/mchs_alert/config`,
        payload: {
          name: "MCHS Alert",
          unique_id: "mchs_alert",
          state_topic: `${BASE_TOPIC}/state`,
          payload_on: "ON",
          payload_off: "OFF",
          device_class: "safety",
          device
        }
      },
      sensorConfig(this.discoveryPrefix, "mchs_alert_type", "MCHS Alert Type", `${BASE_TOPIC}/type`, device),
      sensorConfig(this.discoveryPrefix, "mchs_alert_region", "MCHS Alert Region", `${BASE_TOPIC}/region`, device),
      sensorConfig(this.discoveryPrefix, "mchs_alert_message", "MCHS Alert Message", `${BASE_TOPIC}/message`, device),
      sensorConfig(this.discoveryPrefix, "mchs_alert_last_seen", "MCHS Alert Last Seen", `${BASE_TOPIC}/last_seen`, device)
    ];

    await Promise.all(configs.map((item) => this.publish(item.topic, JSON.stringify(item.payload), true)));
  }

  async publishAlert(alert: ClassifiedAlert): Promise<void> {
    await Promise.all([
      this.publish(`${BASE_TOPIC}/state`, alert.state, true),
      this.publish(`${BASE_TOPIC}/type`, alert.type, true),
      this.publish(`${BASE_TOPIC}/region`, alert.region, true),
      this.publish(`${BASE_TOPIC}/message`, alert.message, true),
      this.publish(`${BASE_TOPIC}/raw`, JSON.stringify(alert.raw), false),
      this.publish(`${BASE_TOPIC}/last_seen`, alert.last_seen, true)
    ]);
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

function sensorConfig(discoveryPrefix: string, uniqueId: string, name: string, stateTopic: string, device: object) {
  return {
    topic: `${discoveryPrefix}/sensor/${uniqueId}/config`,
    payload: {
      name,
      unique_id: uniqueId,
      state_topic: stateTopic,
      device
    }
  };
}
