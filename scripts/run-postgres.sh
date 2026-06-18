#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    export_compose_versions

    compose_cmd -f docker-compose.local.yml up postgres
}

main "$@"
