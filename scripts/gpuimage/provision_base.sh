#!/bin/bash
set -x

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install keyboard-configuration
apt-get -y upgrade
apt-get install -y screen curl wget vim iputils-ping apt-transport-https ca-certificates ca-certificates software-properties-common python3-pip
curl -sSO https://dl.google.com/cloudagents/install-monitoring-agent.sh
bash install-monitoring-agent.sh
add-apt-repository ppa:longsleep/golang-backports -y
apt-get update
apt-get -y upgrade
apt-get install -y build-essential pkg-config autoconf gnutls-dev git curl golang-go
curl -O http://developer.download.nvidia.com/compute/cuda/repos/ubuntu1804/x86_64/cuda-repo-ubuntu1804_10.0.130-1_amd64.deb
dpkg --force-confdef --force-confnew -i ./cuda-repo-ubuntu1804_10.0.130-1_amd64.deb
apt-key adv --fetch-keys http://developer.download.nvidia.com/compute/cuda/repos/ubuntu1604/x86_64/7fa2af80.pub
apt-get update
apt-get install cuda-10-0 -y
apt-get -y autoremove
# install nasm
git clone -b nasm-2.14.02 https://repo.or.cz/nasm.git "$HOME/nasm"
cd "$HOME/nasm"
./autogen.sh
./configure
make
make install
# Build and install x264
git clone http://git.videolan.org/git/x264.git "$HOME/x264"
cd "$HOME/x264"
git checkout 545de2ffec6ae9a80738de1b2c8cf820249a2530
./configure --enable-pic --enable-static --disable-cli
make
make install-lib-static
# Install NV Codec Headers
git clone --single-branch https://github.com/FFmpeg/nv-codec-headers "$HOME/nv-codec-headers"
cd "$HOME/nv-codec-headers"
make install
cd ..
rm -rf "$HOME/nv-codec-headers"
# it's time to build FFMPEG.
export PATH=/usr/local/cuda/bin:$HOME/compiled/bin:$PATH
export PKG_CONFIG_PATH=$HOME/compiled/lib/pkgconfig
# export PATH=/usr/local/cuda/bin:/root/compiled/bin:$PATH
# export PATH=/usr/local/cuda/bin:/root/compiled/bin:/usr/local/lib:$PATH
# export PKG_CONFIG_PATH=/root/compiled/lib/pkgconfig

git clone https://git.ffmpeg.org/ffmpeg.git "$HOME/ffmpeg"
cd "$HOME/ffmpeg"
git checkout 4cfc34d9a8bffe4a1dd53187a3e0f25f34023a09
./configure --disable-static --enable-shared \
        --enable-gpl --enable-nonfree --enable-libx264 --enable-cuda --enable-cuvid \
        --enable-nvenc --enable-cuda-nvcc --enable-libnpp --enable-gnutls \
        --extra-ldflags=-L/usr/local/cuda/lib64 \
        --extra-cflags='-pg -I/usr/local/cuda/include' --disable-stripping

# Build and install FFMPEG:
make
make install

# maybe needed
ldconfig /usr/lib64

apt-get update
apt-get -y upgrade

# GPU-ENABLED GO-LIVEPEER
adduser --disabled-password --gecos "" livepeer
