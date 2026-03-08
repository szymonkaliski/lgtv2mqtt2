#!/usr/bin/env bash

rm -rf vendor && mkdir vendor
pushd vendor
wget https://github.com/merdok/homebridge-webos-tv/archive/eefed076a07b53ea8c4a89731e1156a9e4074422.zip -O homebridge-webos-tv.zip
unzip homebridge-webos-tv.zip -d homebridge-webos-tv
rm -rf homebridge-webos-tv.zip
mv homebridge-webos-tv/*/lib/* .
rm -rf homebridge-webos-tv
popd
