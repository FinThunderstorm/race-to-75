#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd)/scripts/common-functions.sh"

function main() {
    required_command npm

    npm_ci

    pushd "$repo"

    info "Installing Playwright browsers"
    npx playwright install

    info "Running Playwright tests"
    npm test -w playwright

    popd
}

main "$@"
