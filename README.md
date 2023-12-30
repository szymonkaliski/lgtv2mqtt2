# `lgtv2mqtt2`

`lgtv2mqtt2` connects WebOS-based TVs with MQTT, exposing a couple of read-write properties to control the TV.

There's [`lgtv2mqtt`](https://github.com/hobbyquaker/lgtv2mqtt) but it didn't work for me, and none of the WebOS libraries on GitHub did either, other than the one bundled with [`homebridge-webos-tv`](https://github.com/merdok/homebridge-webos-tv/) which this project re-uses.

I only exposed the endpoints that I care about, and this repository is provided as-is - feel free to fork and change things and send PRs.

## Installation

1. `npm install lgtv2mqtt2` (optionally with `-g` if you want it to be available globally)
2. create `~/.mqtt-config.json` containing:
  ```
  {
    host: "MQTT_BROKER_ADDRESS",
    username: "MQTT_BROKER_USERNAME",
    password: "MQTT_BROKER_PASSWORD"
  }
  ```
3. create `~/.lgtv-config.json` containing:
  ```
  {
    ip: "LGTV_IP",
    mac: "LGTV_MAC",
    mqttBase: "MQTT_BASE_PATH",
  }
  ```
  - it's best to assign static IP to your TV, and note the MAC address from the router
  - the `mqttBase` is the path under which the properties will be stored

## Usage

First, run `lgtv2mqtt2`.

The tool creates a couple of paths under the `mqttBase` (below). Their values are writable (which updates the TV state), and they react to TV state changes (say from a TV remote) and update the values in MQTT:

- `/power` `["on" | "off"]`
- `/screen` `["on" | "off"]`
- `/volume` `0 - 100`
- `/backlight` `0 - 100`
- `/input` `com.webos.app.hdmi[N]`


