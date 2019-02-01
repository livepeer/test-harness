#!/bin/bash

delay=$DELAY

echo "delaying streamer for $delay seconds"
sleep $delay

exec /usr/local/bin/ffmpeg "$@"
