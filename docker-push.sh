#!/bin/bash
set -e
set -o xtrace

VERSION=$(git log -1 --pretty=%h)

docker tag joshuahhh/lp-per-doc-server-amd64:$VERSION joshuahhh/lp-per-doc-server-amd64:latest
docker push joshuahhh/lp-per-doc-server-amd64:$VERSION
docker push joshuahhh/lp-per-doc-server-amd64:latest
docker tag joshuahhh/lp-per-doc-server-arm64:$VERSION joshuahhh/lp-per-doc-server-arm64:latest
docker push joshuahhh/lp-per-doc-server-arm64:$VERSION
docker push joshuahhh/lp-per-doc-server-arm64:latest

# giving up on multi-arch for now

# docker manifest create \
#   joshuahhh/lp-per-doc-server:$VERSION \
#   --amend joshuahhh/lp-per-doc-server-amd64:$VERSION \
#   --amend joshuahhh/lp-per-doc-server-arm64:$VERSION

# docker manifest push joshuahhh/lp-per-doc-server:$VERSION
