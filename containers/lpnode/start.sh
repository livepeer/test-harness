#!/bin/bash

json_key=$JSON_KEY
echo "storing keys.... $json_key"

# echo $json_key | jq -r '.' > /lpData/keystore/key.json
for chain in rinkeby mainnet devenv offchain
do
  echo $json_key | jq -r '.' > /root/.lpData/$chain/keystore/key.json
done

sleep 3

# ./wait-for-it.sh -t 5 geth:8546 -- exec /usr/bin/livepeer "$@"
exec /usr/bin/livepeer "$@"
