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
const lg = new LgTvController(LGTV_CONFIG.ip, LGTV_CONFIG.mac, "keyfile");

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

Object.values(config).forEach(({ onLgEvents }) => {
  Object.entries(onLgEvents).forEach(([event, handler]) => {
    lg.on(event, (value) => {
      console.log("got lg event:", event, "with value:", value);
      handler(value);
    });
  });
});

client.on("connect", () => {
  Object.keys(config).forEach((topic) => {
    client.subscribe(LGTV_CONFIG.mqttBase + "/" + topic);
  });
});

// lg event FOREGROUND_APP_CHANGED foregroundAppChanged {
//   appId: 'com.webos.app.hdmi1',
//   subscribed: true,
//   windowId: '',
//   processId: ''
// }
//
// lg event AUDIO_STATUS_CHANGED audioStatusChanged {
//   volumeStatus: {
//     activeStatus: true,
//     adjustVolume: true,
//     maxVolume: 100,
//     muteStatus: false,
//     volume: 9,
//     mode: 'normal',
//     soundOutput: 'tv_speaker'
//   },
//   callerId: 'com.webos.service.apiadapter',
//   mute: false,
//   volume: 9
// }
//
// lg event PICTURE_SETTINGS_CHANGED pictureSettingsChanged {
//   brightness: 50,
//   backlight: 50,
//   contrast: 85,
//   color: 50
// }
