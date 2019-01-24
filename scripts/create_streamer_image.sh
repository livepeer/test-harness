#!/bin/bash

cd /tmp
mkdir -p /tmp/streamer/assets
cd /tmp/streamer
echo "FROM jrottenberg/ffmpeg:4.0-ubuntu \n\
  COPY ./assets /temp \n\
  CMD ["--help"] \n\
  " > Dockerfile

cp -r /tmp/assets/* /tmp/streamer/assets && \
sudo docker build -t localhost:5000/streamer:latest .
sudo docker push localhost:5000/streamer:latest
