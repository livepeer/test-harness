#!/bin/bash

json_key=$JSON_KEY

echo $json_key > /lpData/keystore/key.json

exec /usr/bin/livepeer "$@"
