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

function check_shell() {
    info "Checking shell scripts with shellcheck"
    pushd "$repo"

    shellcheck scripts/common-functions.sh scripts/run-backend.sh scripts/fix-lint.sh start-local-env.sh

    popd
}

function main() {
    required_command npm
    required_command shellcheck

    npm_ci

    fix_biome
    fix_markdown
    check_shell
}

main "$@"
