#!/bin/bash
set -e

job() {
  echo Running job $1
  docker build --platform linux/$1 -t joshuahhh/lp-per-doc-server-$1 . && exit
  echo Problem with job $1!
}
export -f job

trap 'tmux kill-session -t my-session' INT
tmux new-session -d -s my-session -n my-window "bash -c 'job amd64'"
tmux split-window -h -t my-session:my-window "bash -c 'job arm64'"
tmux attach-session -t my-session
