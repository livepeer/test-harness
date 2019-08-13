#!/bin/bash

# uninstall old version
sudo apt-get remove docker docker-engine docker.io containerd runc

# setup teh Docker repo
sudo apt-get update
sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg-agent \
    software-properties-common

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# verify that the key fingerprint exists 
sudo apt-key fingerprint 0EBFCD88

sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"

# installing latest version of docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io


# adding Nvidia docker 
# IMPORTANT This assumes that the nvidia drivers are setup and ready to go
# reference https://github.com/NVIDIA/nvidia-docker/tree/master

distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
