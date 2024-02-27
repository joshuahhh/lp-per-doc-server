#!/bin/bash
set -e

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes"
  exit 1
fi

VERSION=$(git log -1 --pretty=%h)
export VERSION

job() {
  echo Running job $1
  docker build --platform linux/$1 -t joshuahhh/lp-per-doc-server-$1:$VERSION . && exit
  echo Problem with job $1!
  sleep 5
}
export -f job

trap 'tmux kill-session -t my-session' INT
tmux new-session -d -s my-session -n my-window "bash -c 'job amd64'"
tmux split-window -h -t my-session:my-window "bash -c 'job arm64'"
tmux attach-session -t my-session
