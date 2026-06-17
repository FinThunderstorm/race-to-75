#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command npm

    check_node_version
    npm_ci

    pushd "$repo"

    info "Linting & formatting with Biome"
    npm run check

    info "Linting Markdown"
    npm run md

    popd

    check_shell_scripts
}

main "$@"
