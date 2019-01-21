#!/bin/bash

matchingStarted=$(docker ps -q | xargs)
[[ -n $matchingStarted ]] && docker stop $matchingStarted
[[ -n $matchingStarted ]] && docker rm $matchingStarted