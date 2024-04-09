#!/usr/bin/env node

import mqtt from "mqtt";
import path from "path";
import yargs from "yargs";
import { homedir } from "os";

import LgTvController from "./vendor/LgTvController.js";
import Events from "./vendor/Events.js";

import getConfig from "./get-config.js";

const argv = yargs(process.argv)
  .option("keyfile", {
    describe: "Path to the keyfile",
    type: "string",
    default: path.join(homedir(), ".lgtv-keyfile"),
  })
  .option("log-level", {
    describe: "Set the log level",
    choices: ["debug", "info", "warn", "error"],
    default: "info",
  })
  .parse();

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

const loggerPrecedence = {
  debug: ["debug", "info", "warn", "error"],
  info: ["info", "warn", "error"],
  warn: ["warn", "error"],
  error: ["error"],
};

const allowedLoggers = loggerPrecedence[argv["log-level"]];

function NOP() {}

const lg = new LgTvController(
  LGTV_CONFIG.ip,
  LGTV_CONFIG.mac,
  "LG TV",
  argv.keyfile,
  undefined,
  undefined,
  {
    info: allowedLoggers.includes("info") ? console.info : NOP,
    warn: allowedLoggers.includes("warn") ? console.warn : NOP,
    debug: allowedLoggers.includes("debug") ? console.debug : NOP,
    error: allowedLoggers.includes("error") ? console.error : NOP,
  }
);

lg.connect();

const state = {};
const config = {
  power: {
    onLgEvents: {
      [Events.TV_TURNED_ON]: () => {
        publishMqttMessageIfDiffers("power", "on");
        publishMqttMessageIfDiffers("screen", "on");
      },
      [Events.TV_TURNED_OFF]: () => {
        publishMqttMessageIfDiffers("power", "off");

        // reset all other settings to "0" when powered off
        publishMqttMessageIfDiffers("backlight", "0");
        publishMqttMessageIfDiffers("volume", "0");
        publishMqttMessageIfDiffers("screen", "off");
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
  console.log("setup finished!\nlist of external inputs:");
  console.log(lg.getExternalInputList());
});
