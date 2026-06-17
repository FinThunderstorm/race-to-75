#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command docker

    export_compose_versions

    info "Building backend Docker image"
    pushd "$repo"

    compose_cmd -f docker-compose.playwright.yml build backend

    popd
}

main "$@"
