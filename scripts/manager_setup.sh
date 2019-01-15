#!/bin/bash

cd /tmp
git clone https://github.com/livepeer/test-harness.git
cp /tmp/config/livepeer /tmp/test-harness/containers/lpnode/binaries
cd /tmp/test-harness/containers/lpnode
sudo docker build -t lpnode:latest .
