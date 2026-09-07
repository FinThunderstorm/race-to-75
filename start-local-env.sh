#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

check_node_version
load_local_env "$@"

required_command tmux
required_command docker
npm_ci

function main() {
    local detach=false
    if [[ "${1:-}" == "--detach" ]]; then
        detach=true
    elif [[ $# -gt 0 ]]; then
        error "Usage: ./start-local-env.sh [--detach]"
        exit 1
    fi
    pushd "$repo"

    # Build the frontend once up front so frontend/dist exists before the
    # backend boots; otherwise Fastify starts in API-only mode. The frontend
    # pane then rebuilds dist on every change via `vite build --watch`.
    info "Building frontend bundle so Fastify can serve it on :7500"
    npm run build --workspace frontend

    session="$PROJECT_NAME"

    tmux kill-session -t "$session" || true
    tmux start-server
    tmux new-session -d -s "$session" -c "$repo"
    tmux split-window -h -t "$session:0" -c "$repo"
    tmux split-window -v -t "$session:0.0" -c "$repo"

    tmux send-keys -t "$session:0.0" "./scripts/run-postgres.sh" C-m
    tmux select-pane -t "$session:0.0" -T "postgres"

    tmux send-keys -t "$session:0.1" "./scripts/run-frontend.sh" C-m
    tmux select-pane -t "$session:0.1" -T "frontend dev"

    tmux send-keys -t "$session:0.2" "./scripts/run-backend.sh" C-m
    tmux select-pane -t "$session:0.2" -T "backend dev"

    tmux select-pane -t "$session:0.2"
    tmux set -t "$session" pane-border-status top
    if [[ "$detach" == false ]]; then
        tmux attach-session -t "$session"
    fi
    popd
}

main "$@"
