#!/bin/bash

json_key=$JSON_KEY
echo "storing keys.... $json_key"

echo $json_key | jq -r '.' > /lpData/keystore/key.json

sleep 1

exec /usr/bin/livepeer "$@"
