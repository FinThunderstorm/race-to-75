#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command docker

    export_compose_versions

    pushd "$repo"

    # amd64 image for the Playwright tests, which run natively on the CI runner.
    info "Building backend image (amd64) for tests"
    compose_cmd -f docker-compose.playwright.yml build backend

    # arm64 image is what we scan and publish — the architecture the deployment
    # server runs. Built via buildx (with QEMU) so it can be cross-built on an
    # amd64 runner and loaded into the local daemon.
    info "Building backend image (arm64) for scanning and publishing"
    docker buildx build \
        --platform linux/arm64 \
        --build-arg NODE_VERSION="$NODE_VERSION" \
        --file backend/Dockerfile \
        --tag "${ARM_IMAGE}" \
        --load \
        .

    popd
}

main "$@"
