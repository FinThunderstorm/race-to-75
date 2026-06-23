#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command docker

    local -r registry="${REGISTRY:-ghcr.io}"
    local -r image_name="${IMAGE_NAME:-finthunderstorm/race-to-75}"
    local -r target="$registry/$image_name"

    # Retag and push the exact arm64 image that 02-build built and 03-scan
    # scanned — no rebuild, so what ships is what was scanned.
    info "Publishing $ARM_IMAGE to $target"

    docker tag "$ARM_IMAGE" "$target:latest"
    docker push "$target:latest"

    # GITHUB_SHA is set in CI; tag the immutable commit reference there too.
    if [[ -n "${GITHUB_SHA:-}" ]]; then
        docker tag "$ARM_IMAGE" "$target:$GITHUB_SHA"
        docker push "$target:$GITHUB_SHA"
    fi
}

main "$@"
