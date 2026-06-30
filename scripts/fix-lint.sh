#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function fix_biome() {
    info "Fixing lint & formatting with Biome"
    pushd "$repo"

    npm run check -- --write

    popd
}

function fix_markdown() {
    info "Fixing Markdown with markdownlint"
    pushd "$repo"

    npm run md:fix

    popd
}

function check_knip() {
    info "Checking for unused files, exports, and dependencies with knip"
    pushd "$repo"

    npm run knip

    popd
}

function main() {
    required_command npm

    npm_ci

    fix_biome
    fix_markdown
    check_shell_scripts
    check_knip
}

main "$@"
