# lgtv2mqtt2

## Vendor files

Never modify files in `vendor/` directly. They are upstream copies from [homebridge-webos-tv](https://github.com/merdok/homebridge-webos-tv/). To update, change the commit hash in `vendor-libraries.sh` and re-run it.

`REMOTE_KEYS` in `cli.js` is a copy of `REMOTE_COMMANDS` in `vendor/LgTvController.js`, which the vendor file does not export. After re-running `vendor-libraries.sh`, make the copy match the vendor list.

Send remote keys through `openPointerSocket` in `pointer-socket.js`, one socket per batch of keys. The vendored pointer socket (`lg.pointerInputSocket`, `sendRemoteInputSocketCommand`) stays out of use.

## Seeing and driving the TV

To see the TV screen or press remote keys on an HDMI device (console, streaming box), use `GET /screenshot.jpg` on `httpPort` and the `/button` MQTT topic, both documented in `README.md`.
