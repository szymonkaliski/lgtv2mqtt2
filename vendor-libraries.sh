#!/usr/bin/env bash

mkdir vendor
pushd vendor
wget https://github.com/merdok/homebridge-webos-tv/archive/ea245f1bfd35c2f00a486881c86b4a7d47e6e354.zip -O homebridge-webos-tv.zip
unzip homebridge-webos-tv.zip -d homebridge-webos-tv
rm -rf homebridge-webos-tv.zip
mv homebridge-webos-tv/*/lib/* .
rm -rf homebridge-webos-tv
popd

