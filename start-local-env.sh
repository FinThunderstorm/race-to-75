#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

check_node_version

required_command tmux
required_command docker
npm_ci

function main() {
    pushd "$repo"

    session="$PROJECT_NAME"

    tmux kill-session -t "$session" || true
    tmux start-server
    tmux new-session -d -s "$session"
    tmux split-window -h

    tmux select-pane -t 1
    tmux send-keys "./scripts/run-postgres.sh" C-m
    tmux select-pane -t 1 -T "postgres"

    tmux select-pane -t 0
    tmux send-keys "./scripts/run-backend.sh" C-m
    tmux select-pane -t 0 -T "backend dev"

    tmux select-pane -t 0
    tmux select-layout even-horizontal
    tmux set pane-border-status top
    tmux attach-session -t "$session"
    popd
}

main "$@"
