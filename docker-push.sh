#!/bin/bash
set -e

VERSION=$(git log -1 --pretty=%h)

docker push joshuahhh/lp-per-doc-server-amd64:$VERSION
docker push joshuahhh/lp-per-doc-server-arm64:$VERSION

docker manifest create \
  joshuahhh/lp-per-doc-server:$VERSION \
  --amend joshuahhh/lp-per-doc-server-amd64:$VERSION \
  --amend joshuahhh/lp-per-doc-server-arm64:$VERSION

docker manifest push joshuahhh/lp-per-doc-server:$VERSION
