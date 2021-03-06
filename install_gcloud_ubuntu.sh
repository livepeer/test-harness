#!/bin/bash

#ref: https://cloud.google.com/sdk/docs/quickstart-debian-ubuntu


if hash gcloud 2>/dev/null;
then
  echo "gcloud already exists"
else
  echo "installing gcloud..."
    
  export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)" && \
  echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
  curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add - && \
  sudo apt-get update && sudo apt-get install google-cloud-sdk
fi
