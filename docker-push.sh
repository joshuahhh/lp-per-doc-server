#!/bin/bash
set -e

docker push joshuahhh/lp-per-doc-server-amd64
docker push joshuahhh/lp-per-doc-server-arm64

docker manifest create \
  joshuahhh/lp-per-doc-server \
  --amend joshuahhh/lp-per-doc-server-amd64 \
  --amend joshuahhh/lp-per-doc-server-arm64

docker manifest push joshuahhh/lp-per-doc-server
