#!/usr/bin/env node

import mqtt from "mqtt";

import LgTvController from "./vendor/LgTvController.js";
import Events from "./vendor/Events.js";

import getConfig from "./get-config.js";

const MQTT_CONFIG = getConfig(".mqtt-config.json", {
  host: "MQTT_BROKER_ADDRESS",
  username: "MQTT_BROKER_USERNAME",
  password: "MQTT_BROKER_PASSWORD",
});

const LGTV_CONFIG = getConfig(".lgtv-config.json", {
  ip: "LGTV_IP",
  mac: "LGTV_MAC",
  mqttBase: "MQTT_BASE_PATH",
});

const client = mqtt.connect(MQTT_CONFIG);

const lg = new LgTvController(
  LGTV_CONFIG.ip,
  LGTV_CONFIG.mac,
  "LG TV",
  "keyfile",
  undefined,
  undefined,
  {
    info: console.info,
    warn: console.warn,
    // "debug" is very noisy, TODO: configure log level through env
    // debug: console.debug,
    debug: () => {},
    error: console.error,
  }
);

lg.connect();

const state = {};
const config = {
  power: {
    onLgEvents: {
      [Events.TV_TURNED_ON]: () => {
        publishMqttMessageIfDiffers("power", "on");
      },
      [Events.TV_TURNED_OFF]: () => {
        publishMqttMessageIfDiffers("power", "off");
      },
    },

    onMqttMessage: (value) => {
      if (value === "on") {
        lg.turnOn();
      }

      if (value === "off") {
        lg.turnOff();
      }
    },
  },

  volume: {
    onLgEvents: {
      [Events.AUDIO_STATUS_CHANGED]: (value) => {
        publishMqttMessageIfDiffers("volume", `${value.volume}`);
      },
    },

    onMqttMessage: (value) => {
      if (!lg.isTvOn()) {
        return;
      }

      lg.setVolumeLevel(parseInt(value));
    },
  },

  backlight: {
    onLgEvents: {
      [Events.PICTURE_SETTINGS_CHANGED]: (value) => {
        publishMqttMessageIfDiffers("backlight", `${value.backlight}`);
      },
    },

    onMqttMessage: (value) => {
      if (!lg.isTvOn()) {
        return;
      }

      lg.setBacklight(parseInt(value));
    },
  },

  screen: {
    onLgEvents: {
      [Events.SCREEN_STATE_CHANGED]: (value) => {
        if (value.state === "Screen On" || value.processing === "Screen On") {
          publishMqttMessageIfDiffers("screen", "on");
        } else if (value.state === "Screen Off") {
          publishMqttMessageIfDiffers("screen", "off");
        }
      },
    },

    onMqttMessage: (value) => {
      if (!lg.isTvOn()) {
        return;
      }

      if (value === "on") {
        lg.turnOnTvScreen();
      }

      if (value === "off") {
        lg.turnOffTvScreen();
      }
    },
  },

  input: {
    onLgEvents: {
      [Events.FOREGROUND_APP_CHANGED]: (value) => {
        // not sure what else can come up here
        if (value.appId.includes("hdmi")) {
          publishMqttMessageIfDiffers("input", value.appId);
        }
      },
    },

    onMqttMessage: (value) => {
      if (!lg.isTvOn()) {
        return;
      }

      lg.launchApp(value);
    },
  },
};

function publishMqttMessageIfDiffers(topic, value) {
  if (state[topic] !== value) {
    client.publishAsync(LGTV_CONFIG.mqttBase + "/" + topic, value, {
      retain: true,
    });
    state[topic] = value;
  }
}

client.on("message", (topic, message) => {
  topic = topic.replace(LGTV_CONFIG.mqttBase + "/", "");
  const mqttValue = message.toString();

  if (!config[topic]) {
    console.log("no config for topic:", topic);
    return;
  }

  console.log(
    "got mqtt message for topic:",
    topic,
    "with value:",
    mqttValue,
    "current state value is:",
    state[topic]
  );

  if (state[topic] !== mqttValue) {
    config[topic].onMqttMessage(mqttValue);
    state[topic] = mqttValue;
  }
});

Object.values(config).forEach(({ onLgEvents = {} }) => {
  Object.entries(onLgEvents).forEach(([event, handler]) => {
    lg.on(event, (value) => {
      console.log("got lg event:", event, "with value:", value);
      handler(value);
    });
  });
});

client.on("connect", () => {
  Object.keys(config).forEach((topic) => {
    console.log("subscribing to topic:", topic);
    client.subscribe(LGTV_CONFIG.mqttBase + "/" + topic);
  });
});

lg.on(Events.SETUP_FINISHED, () => {
  console.log(
    "setup finished!\nlist of external inputs:",
    lg.getExternalInputList()
  );
});
