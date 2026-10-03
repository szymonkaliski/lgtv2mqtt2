#!/usr/bin/env node

import mqtt from "mqtt";
import fs from "fs";
import http from "http";
import path from "path";
import yargs from "yargs";
import { homedir } from "os";
import { setTimeout as sleep } from "timers/promises";

import LgTvController from "./vendor/LgTvController.js";
import Events from "./vendor/Events.js";

import getConfig from "./get-config.js";
import paths from "./paths.js";
import { openPointerSocket } from "./pointer-socket.js";

function migrateKeyfile() {
  const oldPath = path.join(homedir(), ".lgtv-keyfile");
  const newPath = path.join(paths.data, "keyfile");

  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.mkdirSync(paths.data, { recursive: true });
    fs.renameSync(oldPath, newPath);
    console.log(`Migrated ${oldPath} -> ${newPath}`);
  }
}

migrateKeyfile();
fs.mkdirSync(paths.data, { recursive: true });

const argv = yargs(process.argv)
  .option("keyfile", {
    describe: "Path to the keyfile",
    type: "string",
    default: path.join(paths.data, "keyfile"),
  })
  .option("log-level", {
    describe: "Set the log level",
    choices: ["debug", "info", "warn", "error"],
    default: "info",
  })
  .parse();

const MQTT_CONFIG = getConfig(
  "mqtt.json",
  {
    host: "MQTT_BROKER_ADDRESS",
    username: "MQTT_BROKER_USERNAME",
    password: "MQTT_BROKER_PASSWORD",
  },
  ".mqtt-config.json"
);

const LGTV_CONFIG = getConfig(
  "lgtv.json",
  {
    ip: "LGTV_IP",
    mac: "LGTV_MAC",
    mqttBase: "MQTT_BASE_PATH",
    httpPort: "HTTP_PORT",
  },
  ".lgtv-config.json"
);

const statusTopic = LGTV_CONFIG.mqttBase + "/lwt";

const client = mqtt.connect({
  ...MQTT_CONFIG,
  will: {
    topic: statusTopic,
    payload: "Offline",
    retain: true,
  },
});

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

const originalDisconnect = lg.disconnect.bind(lg);
lg.disconnect = function () {
  originalDisconnect();
  lg.emit(Events.TV_TURNED_OFF, {});
};

const state = {};
const config = {
  power: {
    onLgEvents: {
      [Events.TV_TURNED_ON]: () => {
        forcePublishMqtt("power", "on");
        forcePublishMqtt("screen", "on");
      },
      [Events.TV_TURNED_OFF]: () => {
        publishOffState();
      },
      [Events.PIXEL_REFRESHER_STARTED]: () => {
        publishOffState();
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

// key names that sendRemoteInputSocketCommand in vendor/LgTvController.js
// accepts (its REMOTE_COMMANDS list)
const REMOTE_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "LIST",
  "AD",
  "DASH",
  "MUTE",
  "VOLUMEUP",
  "VOLUMEDOWN",
  "CHANNELUP",
  "CHANNELDOWN",
  "HOME",
  "MENU",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "CLICK",
  "BACK",
  "EXIT",
  "PROGRAM",
  "ENTER",
  "INFO",
  "RED",
  "GREEN",
  "YELLOW",
  "BLUE",
  "LIVE_ZOOM",
  "CC",
  "PLAY",
  "PAUSE",
  "REWIND",
  "FASTFORWARD",
  "POWER",
  "FAVORITES",
  "RECORD",
  "FLASHBACK",
  "QMENU",
  "GOTOPREV",
  "GOTONEXT",
  "3D_MODE",
  "SAP",
  "ASPECT_RATIO",
  "EJECT",
  "MYAPPS",
  "RECENT",
  "BS",
  "BS_NUM_1",
  "BS_NUM_2",
  "BS_NUM_3",
  "BS_NUM_4",
  "BS_NUM_5",
  "BS_NUM_6",
  "BS_NUM_7",
  "BS_NUM_8",
  "BS_NUM_9",
  "BS_NUM_10",
  "BS_NUM_11",
  "BS_NUM_12",
  "CS1",
  "CS1_NUM_1",
  "CS1_NUM_2",
  "CS1_NUM_3",
  "CS1_NUM_4",
  "CS1_NUM_5",
  "CS1_NUM_6",
  "CS1_NUM_7",
  "CS1_NUM_8",
  "CS1_NUM_9",
  "CS1_NUM_10",
  "CS1_NUM_11",
  "CS1_NUM_12",
  "CS2",
  "CS2_NUM_1",
  "CS2_NUM_2",
  "CS2_NUM_3",
  "CS2_NUM_4",
  "CS2_NUM_5",
  "CS2_NUM_6",
  "CS2_NUM_7",
  "CS2_NUM_8",
  "CS2_NUM_9",
  "CS2_NUM_10",
  "CS2_NUM_11",
  "CS2_NUM_12",
  "TER",
  "TER_NUM_1",
  "TER_NUM_2",
  "TER_NUM_3",
  "TER_NUM_4",
  "TER_NUM_5",
  "TER_NUM_6",
  "TER_NUM_7",
  "TER_NUM_8",
  "TER_NUM_9",
  "TER_NUM_10",
  "TER_NUM_11",
  "TER_NUM_12",
  "3DIGIT_INPUT",
  "BML_DATA",
  "JAPAN_DISPLAY",
  "TELETEXT",
  "TEXTOPTION",
  "MAGNIFIER_ZOOM",
  "SCREEN_REMOT",
];

// the TV drops remote keys that arrive back to back
const REMOTE_KEY_DELAY_MS = 600;

// command topics act on every message and never publish state
const commands = {
  button: {
    onMqttMessage: (value) => {
      if (!lg.isTvOn()) {
        console.log("tv is off, ignoring button message:", value);
        return;
      }

      const keys = value.split(/\s+/).filter((key) => key !== "");

      if (keys.length === 0) {
        console.log("ignoring empty button message");
        return;
      }

      const unknownKeys = keys.filter((key) => !REMOTE_KEYS.includes(key));

      if (unknownKeys.length > 0) {
        console.log("ignoring button message, unknown keys:", unknownKeys);
        return;
      }

      pressRemoteKeys(keys);
    },
  },
};

function publishMqttMessageIfDiffers(topic, value) {
  if (state[topic] !== value) {
    forcePublishMqtt(topic, value);
  }
}

function forcePublishMqtt(topic, value) {
  client.publishAsync(LGTV_CONFIG.mqttBase + "/" + topic, value, {
    retain: true,
  });
  state[topic] = value;
}

function publishOffState() {
  forcePublishMqtt("power", "off");
  forcePublishMqtt("backlight", "0");
  forcePublishMqtt("volume", "0");
  forcePublishMqtt("screen", "off");
}

// keys from all button messages go out one at a time, REMOTE_KEY_DELAY_MS apart
let remoteKeyQueue = Promise.resolve();

function pressRemoteKeys(keys) {
  remoteKeyQueue = remoteKeyQueue
    .then(async () => {
      const socket = await openPointerSocket((uri) => lg.tvRequest(uri));

      try {
        for (const key of keys) {
          console.log("sending remote key:", key);
          socket.press(key);
          await sleep(REMOTE_KEY_DELAY_MS);
        }
      } finally {
        socket.close();
      }
    })
    .catch((error) => console.error("sending remote keys failed:", error));
}

client.on("message", (topic, message, packet) => {
  topic = topic.replace(LGTV_CONFIG.mqttBase + "/", "");
  const mqttValue = message.toString();

  if (commands[topic]) {
    console.log("got mqtt command for topic:", topic, "with value:", mqttValue);

    // the broker replays a retained message on every subscribe
    if (packet.retain) {
      console.log("ignoring retained command for topic:", topic);
      return;
    }

    commands[topic].onMqttMessage(mqttValue);
    return;
  }

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
  client.publishAsync(statusTopic, "Online", { retain: true });
  [...Object.keys(config), ...Object.keys(commands)].forEach((topic) => {
    console.log("subscribing to topic:", topic);
    client.subscribe(LGTV_CONFIG.mqttBase + "/" + topic);
  });
});

lg.on(Events.SETUP_FINISHED, () => {
  console.log("setup finished!\nlist of external inputs:");
  console.log(lg.getExternalInputList());
});

const SCREENSHOT_FETCH_TIMEOUT_MS = 5000;

// the TV stores each capture on its own web server and returns the image URL.
// That URL is sometimes https with a self-signed certificate, and the same
// path is also served over plain http on port 3000
async function captureScreenshot() {
  const response = await lg.tvRequest("ssap://tv/executeOneShot");

  if (!response?.imageUri) {
    return null;
  }

  const imageUrl = new URL(response.imageUri);
  imageUrl.protocol = "http:";
  imageUrl.port = "3000";

  const image = await fetch(imageUrl, {
    signal: AbortSignal.timeout(SCREENSHOT_FETCH_TIMEOUT_MS),
  });

  if (!image.ok) {
    throw new Error(`fetching ${imageUrl} failed with ${image.status}`);
  }

  return Buffer.from(await image.arrayBuffer());
}

const server = http.createServer(async (req, res) => {
  const [pathname] = req.url.split("?");

  if (req.method !== "GET" || pathname !== "/screenshot.jpg") {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
    return;
  }

  if (!lg.isTvOn()) {
    res.writeHead(503, { "content-type": "text/plain" }).end("tv is off\n");
    return;
  }

  try {
    const image = await captureScreenshot();

    if (!image) {
      res
        .writeHead(502, { "content-type": "text/plain" })
        .end("tv returned no capture\n");
      return;
    }

    res
      .writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
      })
      .end(image);
  } catch (error) {
    console.error("screenshot failed:", error);
    res
      .writeHead(502, { "content-type": "text/plain" })
      .end("screenshot failed\n");
  }
});

server.listen(LGTV_CONFIG.httpPort, () => {
  console.log("http server listening on port:", LGTV_CONFIG.httpPort);
});
