#!/bin/bash
set -x

export distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
export DEBIAN_FRONTEND=noninteractive
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
# curl -O http://developer.download.nvidia.com/compute/cuda/repos/ubuntu1804/x86_64/cuda-repo-ubuntu1804_10.0.130-1_amd64.deb
curl -O http://developer.download.nvidia.com/compute/cuda/repos/ubuntu1804/x86_64/cuda-repo-ubuntu1804_10.1.243-1_amd64.deb
sudo dpkg --force-confdef --force-confnew -i ./cuda-repo-ubuntu1804_10.1.243-1_amd64.deb
sudo apt-key adv --fetch-keys http://developer.download.nvidia.com/compute/cuda/repos/ubuntu1604/x86_64/7fa2af80.pub
sudo apt-get update
# sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cuda-drivers nvidia-container-toolkit
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y cuda-drivers  nvidia-docker2
sudo systemctl restart docker
sudo sed -i 's/#swarm-resource/swarm-resource/' /etc/nvidia-container-runtime/config.toml
