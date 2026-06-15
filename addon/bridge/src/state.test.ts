import { describe, expect, it } from "vitest";
import { classify } from "./classifier";
import { DEFAULT_CONFIG } from "./config";
import { AlertStateMachine } from "./state";
import { Config, NotificationPayload } from "./types";

const config: Config = {
  ...DEFAULT_CONFIG,
  region: "Брянская область",
  regions: ["Брянская область", "Курская область"],
  filter_by_region: true,
  deduplicate_window_seconds: 30
};

function payload(text: string, id = 1): NotificationPayload {
  return {
    packageName: "ru.mchs.app",
    title: "МЧС России",
    text,
    bigText: text,
    postTime: 1710000000000,
    notificationId: id
  };
}

describe("classifier", () => {
  it("classifies uav alert", () => {
    expect(classify(payload("Беспилотная опасность объявлена на территории Брянская область"), config).type).toBe("uav_alert");
  });

  it("classifies missile alert", () => {
    expect(classify(payload("Ракетная опасность объявлена на территории Брянская область"), config).type).toBe("missile_alert");
  });

  it("classifies air alert", () => {
    expect(classify(payload("Воздушная тревога объявлена на территории Брянская область"), config).type).toBe("air_alert");
  });

  it("classifies cancel", () => {
    expect(classify(payload("Отбой ракетной опасности на территории Брянская область"), config).type).toBe("cancel_alert");
  });
});

describe("state machine", () => {
  it("unknown does not reset active state", () => {
    const machine = new AlertStateMachine(config);
    machine.apply(classify(payload("Ракетная опасность Брянская область", 1), config), 1000);
    machine.apply(classify(payload("Информационное сообщение Брянская область", 2), config), 2000);
    expect(machine.snapshot().state).toBe("ON");
    expect(machine.snapshot().last_event_type).toBe("unknown");
  });

  it("region mismatch does not change main state when filter_by_region=true", () => {
    const machine = new AlertStateMachine(config);
    machine.apply(classify(payload("Беспилотная опасность Курская область", 1), config), 1000);
    expect(machine.snapshot().state).toBe("OFF");
    expect(machine.snapshot().last_event_type).toBe("uav_alert");
  });

  it("deduplication works", () => {
    const machine = new AlertStateMachine(config);
    const event = classify(payload("Беспилотная опасность Брянская область", 1), config);
    expect(machine.apply(event, 1000).duplicate).toBe(false);
    expect(machine.apply(event, 2000).duplicate).toBe(true);
  });
});
