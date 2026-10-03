# `lgtv2mqtt2`

`lgtv2mqtt2` connects WebOS-based TVs with MQTT, exposing a couple of read-write properties to control the TV.

There's [`lgtv2mqtt`](https://github.com/hobbyquaker/lgtv2mqtt) but it didn't work for me, and none of the WebOS libraries on GitHub did either, other than the one bundled with [`homebridge-webos-tv`](https://github.com/merdok/homebridge-webos-tv/) which this project re-uses.

I only exposed the endpoints that I care about, and this repository is provided as-is - feel free to fork and change things and send PRs.

## Installation

1. `npm install lgtv2mqtt2` (optionally with `-g` if you want it to be available globally)
2. create `~/.config/lgtv2mqtt2/mqtt.json` containing:
  ```
  {
    host: "MQTT_BROKER_ADDRESS",
    username: "MQTT_BROKER_USERNAME",
    password: "MQTT_BROKER_PASSWORD"
  }
  ```
3. create `~/.config/lgtv2mqtt2/lgtv.json` containing:
  ```
  {
    ip: "LGTV_IP",
    mac: "LGTV_MAC",
    mqttBase: "MQTT_BASE_PATH",
    httpPort: HTTP_PORT,
  }
  ```
  - it's best to assign static IP to your TV, and note the MAC address from the router
  - the `mqttBase` is the path under which the properties will be stored
  - the `httpPort` is where the [screenshot endpoint](#screenshots) listens
  - all keys are required, the tool exits at startup when one is missing

Config files follow the [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/latest/) convention. If `XDG_CONFIG_HOME` is set, config files are stored under `$XDG_CONFIG_HOME/lgtv2mqtt2/` instead. Existing config files in `~/` are automatically migrated on first run.

## Usage

First, run `lgtv2mqtt2`.

The tool creates a couple of paths under the `mqttBase` (below). Their values are writable (which updates the TV state), and they react to TV state changes (say from a TV remote) and update the values in MQTT:

- `/power` `["on" | "off"]`
- `/screen` `["on" | "off"]`
- `/volume` `0 - 100`
- `/backlight` `0 - 100`
- `/input` `com.webos.app.hdmi[N]`

`/button` is write-only. Each message presses one remote key, or several keys separated by spaces (for example `DOWN DOWN ENTER`), 600 ms apart. Key names come from `REMOTE_COMMANDS` in `vendor/LgTvController.js` (`UP`, `DOWN`, `LEFT`, `RIGHT`, `ENTER`, `BACK`, `HOME`, `EXIT`, ...). A message with an unknown key name presses nothing. The TV forwards the keys over HDMI-CEC to the active HDMI device. Publish button messages without the retain flag. The broker replays a retained message on every subscribe, and the bridge ignores these replays.

## Screenshots

`GET http://<host>:<httpPort>/screenshot.jpg` captures the current TV screen and returns it as a JPEG. The TV picks the resolution. Each request takes a fresh capture.

- the capture includes HDMI inputs, so it shows the menus of a console or streaming box
- copy-protected content can come back black
- `503` means the TV is off, `502` means the TV returned no capture
- the endpoint listens on all network interfaces and has no authentication, so anyone on your network can see the TV screen

Together with `/button` this drives an HDMI device remotely: press keys, then fetch a screenshot to see where you are.


