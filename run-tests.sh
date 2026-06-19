#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

function test_compose_cmd() {
    required_command docker

    docker compose --project-name "$PROJECT_NAME-tests" "$@"
}

function main() {
    required_command docker

    export_compose_versions

    pushd "$repo"

    trap 'test_compose_cmd -f docker-compose.playwright.yml down --remove-orphans' EXIT

    info "Running Playwright tests in isolated Docker Compose stack"
    test_compose_cmd -f docker-compose.playwright.yml up \
        --build --abort-on-container-exit --exit-code-from playwright

    popd
}

main "$@"
