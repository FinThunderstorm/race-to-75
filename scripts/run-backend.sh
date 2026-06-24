#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd)/scripts/common-functions.sh"

function main() {
    required_command npm
    export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/race_to_75}"
    export JWT_SECRET="${JWT_SECRET:-race-to-75-local-development}"
    export COOKIE_SECRET="${COOKIE_SECRET:-race-to-75-local-development}"

    wait_for_port 5432

    pushd "$repo/backend"

    npm run db:migrate
    npm run dev

    popd
}

main "$@"
