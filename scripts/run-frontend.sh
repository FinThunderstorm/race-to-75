#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command npm

    pushd "$repo/frontend"

    npm run dev

    popd
}

main "$@"
