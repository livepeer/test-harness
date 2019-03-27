#!/bin/bash

cd /tmp

if [ ! -d /tmp/test-harness ]; then
  git clone -b it/officialimage https://github.com/livepeer/test-harness.git
fi

# if [ ! -d /tmp/go-livepeer ]; then
#   git clone https://github.com/livepeer/go-livepeer.git
#   cd /tmp/go-livepeer
#   git fetch origin && git checkout -b fix/nasm-version origin/fix/nasm-version
# fi

# mkdir -p go/src/github.com/livepeer
#cd go/src/github.com/livepeer
# rm -rf go-livepeer && git clone https://github.com/livepeer/go-livepeer.git && \

# cd /tmp/go/src/github.com/livepeer/go-livepeer
# sudo docker build -t go-livepeer:latest . && echo "working directory : $PWD" && \
# sudo docker run -w /go/src/github.com/livepeer/go-livepeer/cmd/livepeer go-livepeer:latest go get -v ./... && \
# echo "livepeer go get done" && \
# sudo docker run -v "${PWD}":/tmp -w /go/src/github.com/livepeer/go-livepeer/cmd/livepeer go-livepeer:latest go build -v -o /tmp/livepeer .
# sudo docker run -v "$PWD":/go -w /go/src/github.com/livepeer/go-livepeer golang:1.10.3-stretch go get -v ./cmd/livepeer
# sudo docker run -v "$PWD":/go -w /go/src/github.com/livepeer/go-livepeer golang:1.10.3-stretch go build -v ./cmd/livepeer


# cd /tmp/assets
# sudo chown docker-user:docker-user -R /tmp/assets && \
# # sudo chmod +x /tmp/assets/livepeer && sudo cp /tmp/assets/livepeer /tmp/config/livepeer && \
# sudo cp livepeer.tar.gz /tmp/config && cd /tmp/config && sudo tar -xvzf livepeer.tar.gz
# sudo chmod +x /tmp/config/livepeer
# cp /tmp/config/livepeer /tmp/test-harness/containers/lpnode/binaries
# cd /tmp/test-harness/containers/lpnode
# sudo docker build -t localhost:5000/lpnode:latest -f Dockerfile . && \
# sudo docker push localhost:5000/lpnode:latest

#
# cd /tmp/go-livepeer
# sudo docker build -t localhost:5000/lpnode:latest -f Dockerfile.alpine . && \
# sudo docker push localhost:5000/lpnode:latest

if [ $1 == "binary" ]; then
  echo "found binary flag!!"
  cd /tmp/config
else
  cd /tmp/assets
  sudo chown docker-user:docker-user -R /tmp/assets && \
  sudo cp livepeer.tar.gz /tmp/config && cd /tmp/config
fi

sudo tar -zxvf livepeer.tar.gz
sudo chmod +x /tmp/config/livepeer
cp /tmp/config/livepeer /tmp/test-harness/containers/lpnode/binaries
cd /tmp/test-harness/containers/lpnode
sudo docker build -t localhost:5000/lpnode:latest -f Dockerfile . && \
sudo docker push localhost:5000/lpnode:latest
