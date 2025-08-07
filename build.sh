#!/bin/bash

export REGISTRY_URL=registry.cyydm.shop
export NAMESPACE=tools

./build_and_push.sh -r registry.cyydm.shop -n tools
# CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC=x86_64-linux-gnu-gcc go build -v -o bookmark