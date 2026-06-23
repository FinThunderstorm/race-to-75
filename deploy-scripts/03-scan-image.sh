#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

readonly GATE_SEVERITY="HIGH,CRITICAL"
readonly SCANNERS="vuln,secret,misconfig"

function main() {
    required_command docker

    pushd "$repo"

    info "Scanning dependencies (package-lock.json)"
    trivy fs \
        --scanners vuln \
        --skip-dirs '**/node_modules/**' \
        --ignore-unfixed \
        --severity "$GATE_SEVERITY" \
        --exit-code 1 \
        "$repo"

    info "Scanning the arm64 image (OS packages, secrets, misconfig)"
    trivy image \
        --scanners "$SCANNERS" \
        --skip-dirs '**/node_modules/**' \
        --ignore-unfixed \
        --severity "$GATE_SEVERITY" \
        --exit-code 1 \
        "$ARM_IMAGE"

    popd
}

main "$@"
