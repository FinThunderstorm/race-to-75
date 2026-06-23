#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command docker

    export_compose_versions

    pushd "$repo"

    trap 'compose_cmd -f docker-compose.playwright.yml down --remove-orphans' EXIT

    info "Running Playwright tests via docker compose"
    compose_cmd -f docker-compose.playwright.yml up \
        --abort-on-container-exit --exit-code-from playwright

    popd
}

main "$@"
