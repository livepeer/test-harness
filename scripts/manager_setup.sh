#!/bin/bash

cd /tmp
git clone https://github.com/livepeer/test-harness.git
mkdir -p go/src/github.com/livepeer
#cd go/src/github.com/livepeer
#rm -rf go-livepeer && git clone https://github.com/livepeer/go-livepeer.git && \

# cd /tmp/go/src/github.com/livepeer/go-livepeer
# sudo docker build -t go-livepeer:latest . && echo "working directory : $PWD" && \
# sudo docker run -w /go/src/github.com/livepeer/go-livepeer/cmd/livepeer go-livepeer:latest go get -v ./... && \
# echo "livepeer go get done" && \
# sudo docker run -v "${PWD}":/tmp -w /go/src/github.com/livepeer/go-livepeer/cmd/livepeer go-livepeer:latest go build -v -o /tmp/livepeer .
# sudo docker run -v "$PWD":/go -w /go/src/github.com/livepeer/go-livepeer golang:1.10.3-stretch go get -v ./cmd/livepeer
# sudo docker run -v "$PWD":/go -w /go/src/github.com/livepeer/go-livepeer golang:1.10.3-stretch go build -v ./cmd/livepeer
sudo chown docker-user:docker-user -R /tmp/assets && \
sudo chmod +x /tmp/assets/livepeer && sudo cp /tmp/assets/livepeer /tmp/config/livepeer && \
cp /tmp/config/livepeer /tmp/test-harness/containers/lpnode/binaries
cd /tmp/test-harness/containers/lpnode
sudo docker build -t localhost:5000/lpnode:latest . && \
sudo docker push localhost:5000/lpnode:latest
