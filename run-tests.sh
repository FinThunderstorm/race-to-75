#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

backend_pid=""

function cleanup() {
    if [[ -n "${backend_pid:-}" ]]; then
        kill "$backend_pid" 2>/dev/null || true
        wait "$backend_pid" 2>/dev/null || true
    fi
}

function main() {
    required_command npm
    required_command docker

    npm_ci

    pushd "$repo"

    export_compose_versions

    info "Starting local PostgreSQL"
    compose_cmd -f docker-compose.local.yml up -d postgres

    info "Starting backend"
    ./scripts/run-backend.sh &
    backend_pid=$!
    trap cleanup EXIT

    wait_for_port 7500

    info "Installing Playwright browsers"
    npx playwright install

    info "Running Playwright tests"
    npm test -w playwright

    popd
}

main "$@"
