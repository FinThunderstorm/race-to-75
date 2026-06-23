#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

check_node_version

required_command tmux
required_command docker
npm_ci

function main() {
    pushd "$repo"

    # Build the frontend once up front so frontend/dist exists before the
    # backend boots; otherwise Fastify starts in API-only mode. The frontend
    # pane then rebuilds dist on every change via `vite build --watch`.
    info "Building frontend bundle so Fastify can serve it on :7500"
    npm run build --workspace frontend

    session="$PROJECT_NAME"

    tmux kill-session -t "$session" || true
    tmux start-server
    tmux new-session -d -s "$session"
    tmux split-window -h
    tmux select-pane -t 0
    tmux split-window -v

    tmux select-pane -t 0
    tmux send-keys "./scripts/run-postgres.sh" C-m
    tmux select-pane -t 0 -T "postgres"

    tmux select-pane -t 1
    tmux send-keys "./scripts/run-frontend.sh" C-m
    tmux select-pane -t 1 -T "frontend dev"

    tmux select-pane -t 2
    tmux send-keys "./scripts/run-backend.sh" C-m
    tmux select-pane -t 2 -T "backend dev"

    tmux select-pane -t 2
    tmux set pane-border-status top
    tmux attach-session -t "$session"
    popd
}

main "$@"
