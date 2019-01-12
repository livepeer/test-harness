#!/bin/bash

json_key=$JSON_KEY
echo "storing keys.... $json_key"

echo $json_key | jq -r '.' > /lpData/keystore/key.json

sleep 3

./wait-for-it.sh -t 30 geth:8546 -- exec /usr/bin/livepeer "$@"
