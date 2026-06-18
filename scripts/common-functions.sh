#!/usr/bin/env bash
function info() {
    echo "$(date +"[%Y-%m-%d %H:%M:%S]") $*"
}

function debug() {
    echo "::debug::$(date +"[%Y-%m-%d %H:%M:%S]") $*"
}

function warn() {
    echo "::warning::$(date +"[%Y-%m-%d %H:%M:%S]") $*" >&2
}

function error() {
    echo "::error::$(date +"[%Y-%m-%d %H:%M:%S]") $*" >&2
}

function start_group() {
    echo "::group::$*"
}

function end_group() {
    echo "::endgroup::"
}

readonly PROJECT_NAME="race-to-75"
repo="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)"
readonly repo

function check_node_version() {
    pushd "$repo"
    debug "Setting up right Node version"

    # This will use always repo provided nvm if nvm is not in PATH etc.
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck source=/dev/null
    source "./scripts/nvm.sh"
    nvm use || nvm install

    popd
}

function required_command() {
    if ! command -v "$1" &> /dev/null
    then
        error "$1 could not be found"
        exit
    fi
}

function npm_ci() {
    pushd "$repo"
    debug "Installing dependencies with npm ci"

    required_command shasum

    # check if shashum is same, do not run npm ci
    if shasum -c "node_modules/package-lock.json.sha1" &> /dev/null
    then
        info "package-lock.json has not changed, no need for npm ci"
    else
        info "package-lock.json has changed, running npm ci"
        npm ci
        shasum "package-lock.json" > "node_modules/package-lock.json.sha1"
    fi

    popd
}

function compose_cmd() {
    required_command docker

    docker compose --project-name "$PROJECT_NAME" "$@"
}

# Export the versions the compose file substitutes, sourced from their single
# source of truth so the container images always match the project.
function export_compose_versions() {
    NODE_VERSION="$(cat "$repo/.nvmrc")"
    POSTGRES_VERSION="$(cat "$repo/.postgres-version")"
    PLAYWRIGHT_VERSION="$(sed -n 's/.*"@playwright\/test": *"\([^"]*\)".*/\1/p' "$repo/playwright/package.json")"
    export NODE_VERSION PLAYWRIGHT_VERSION POSTGRES_VERSION
}

function wait_for_port() {
    local port=$1
    info "Waiting for port $port to be ready..."
    while ! nc -z localhost "$port" 2>/dev/null; do
        sleep 1
    done
}

function check_shell_scripts() {
    required_command shellcheck
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
