#!/bin/bash

cd /tmp
mkdir -p /tmp/streamer/assets
mkdir -p /tmp/streamer/config
cd /tmp/streamer
echo "FROM jrottenberg/ffmpeg:4.0-alpine \n\
  ARG DELAY=0\n\
  COPY ./assets /temp \n\
  WORKDIR /\n\
  COPY ./config/delay.sh .\n\
  RUN chmod +x delay.sh\n\
  ENTRYPOINT [\"./delay.sh\"]\n\
  CMD [\"--help\"] \n\
  " > Dockerfile

cp -r /tmp/config/* /tmp/streamer/config && \
cp -r /tmp/assets/* /tmp/streamer/assets && \
sudo docker build -t localhost:5000/streamer:latest .
sudo docker push localhost:5000/streamer:latest
