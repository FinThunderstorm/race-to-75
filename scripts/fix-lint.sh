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

    # Third-party / vendored scripts excluded from linting.
    local -r blacklist=("./scripts/nvm.sh")

    local -a exclude=("-not" "-path" "./node_modules/*")
    local entry
    for entry in "${blacklist[@]}"; do
        exclude+=("-not" "-path" "$entry")
    done

    find . -name "*.sh" "${exclude[@]}" -print0 | xargs -0 shellcheck

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
