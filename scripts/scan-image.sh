#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

readonly GATE_SEVERITY="HIGH,CRITICAL"
readonly SCANNERS="vuln,secret,misconfig"

function main() {
    required_command docker

    local -a gate=(--ignore-unfixed --severity "$GATE_SEVERITY" --exit-code 1)
    if [[ "${1:-}" == "--all" ]]; then
        gate=(--exit-code 1)
        shift
    fi

    pushd "$repo"

    local -r image="${1:-$AMD_IMAGE}"
    if [[ $# -eq 0 ]]; then
        export_compose_versions
        info "Building $AMD_IMAGE for scanning"
        compose_cmd -f docker-compose.playwright.yml build backend
    fi

    info "Scanning dependencies (package-lock.json)"
    trivy fs \
        --scanners vuln \
        --skip-dirs '**/node_modules/**' \
        "${gate[@]}" \
        "$repo"

    info "Scanning image '$image' (OS packages, secrets, misconfig)"
    trivy image \
        --scanners "$SCANNERS" \
        --skip-dirs '**/node_modules/**' \
        "${gate[@]}" \
        "$image"

    popd
}

main "$@"
