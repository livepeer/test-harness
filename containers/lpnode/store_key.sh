#!/bin/bash

json_key=$JSON_KEY
echo "storing keys.... $json_key"

echo $json_key | jq -r '.' > /lpData/keystore/key.json

for chain in /lpData/keystore /lpData/rinkeby/keystore /lpData/mainnet/keystore /lpData/devenv/keystore
do
  echo $json_key | jq -r '.' > $chain/key.json
done

sleep 1

exec /usr/bin/livepeer "$@"
