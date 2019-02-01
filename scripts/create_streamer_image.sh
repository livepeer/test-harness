#!/bin/bash

cd /tmp
mkdir -p /tmp/streamer/assets
mkdir -p /tmp/streamer/config
cd /tmp/streamer
echo "FROM jrottenberg/ffmpeg:4.0-ubuntu \n\
  ARG DELAY=0
  COPY ./assets /temp \n\
  WORKDIR /
  COPY ./config/delay.sh .
  ENTRYPOINT [\"./delay.sh\"]\
  CMD [\"--help\"] \n\
  " > Dockerfile

cp -r /tmp/config/* /tmp/streamer/config && \
cp -r /tmp/assets/* /tmp/streamer/assets && \
sudo docker build -t localhost:5000/streamer:latest .
sudo docker push localhost:5000/streamer:latest
