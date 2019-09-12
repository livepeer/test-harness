#!/bin/bash
set -x

export PATH=/usr/local/cuda/bin:$HOME/compiled/bin:$PATH
export PKG_CONFIG_PATH=$HOME/compiled/lib/pkgconfig
# export PATH=/usr/local/cuda/bin:/root/compiled/bin:$PATH
# export PATH=/usr/local/cuda/bin:/root/compiled/bin:/usr/local/lib:$PATH
# export PKG_CONFIG_PATH=/root/compiled/lib/pkgconfig

# maybe needed
# sudo ldconfig /usr/lib64


# GPU-ENABLED GO-LIVEPEER
go get github.com/livepeer/go-livepeer/cmd/livepeer
cd "$HOME/go/src/github.com/livepeer/go-livepeer"
go build ./cmd/livepeer/livepeer.go
