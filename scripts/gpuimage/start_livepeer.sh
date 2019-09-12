#!/bin/bash
export PATH=/usr/local/cuda/bin:$HOME/compiled/bin:$PATH
export PKG_CONFIG_PATH=$HOME/compiled/lib/pkgconfig

FLAGS=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/livepeer_flags -H "Metadata-Flavor: Google")
/home/livepeer/go/src/github.com/livepeer/go-livepeer/livepeer $FLAGS
