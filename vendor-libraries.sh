#!/usr/bin/env bash
set -euo pipefail

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

wget https://github.com/merdok/homebridge-webos-tv/archive/d5590099f8a6e8276d348a7bd4953259a5135425.zip -O "$tmpdir/homebridge-webos-tv.zip"
unzip "$tmpdir/homebridge-webos-tv.zip" -d "$tmpdir/homebridge-webos-tv"

rm -rf vendor && mkdir vendor
mv "$tmpdir"/homebridge-webos-tv/*/lib/* vendor/
