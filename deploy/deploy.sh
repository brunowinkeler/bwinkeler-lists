#!/usr/bin/env bash
# Deploy an immutable Listly image version from GHCR on the production host.
# Runs migrations before rollout, waits for healthchecks, and restores the
# previous image version if pull, migration, startup, or verification fails.
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${COMPOSE_FILE:-$script_dir/compose.prod.yaml}"
env_file="${APP_ENV_FILE:-$script_dir/.env}"
wait_timeout="${WAIT_TIMEOUT:-120}"
target_version="${1:-}"
target_version="${target_version#v}"

usage() {
  cat <<'EOF'
Usage: ./deploy.sh <X.Y.Z>

Example:
  ./deploy.sh 0.1.4
EOF
}

if [[ "$target_version" == '--help' || "$target_version" == '-h' ]]; then
  usage
  exit 0
fi
[[ "$target_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  usage >&2
  exit 2
}
[[ -f "$compose_file" ]] || {
  echo "ERROR: compose file not found: $compose_file" >&2
  exit 1
}
[[ -f "$env_file" ]] || {
  echo "ERROR: app env file not found: $env_file" >&2
  exit 1
}

current_version="$(sed -n 's/^APP_VERSION=//p' "$env_file" | tail -n 1)"
[[ -n "$current_version" ]] || {
  echo "ERROR: APP_VERSION is missing from $env_file" >&2
  exit 1
}

write_version() {
  local version="$1" temporary
  temporary="$(mktemp "${env_file}.XXXXXX")"
  grep -v '^APP_VERSION=' "$env_file" >"$temporary" || true
  printf 'APP_VERSION=%s\n' "$version" >>"$temporary"
  chmod --reference="$env_file" "$temporary" 2>/dev/null || chmod 0600 "$temporary"
  mv "$temporary" "$env_file"
}

compose() {
  sudo docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

rollback() {
  local status=$?
  trap - ERR
  echo "Deploy failed; restoring v$current_version." >&2
  write_version "$current_version"
  compose up -d --remove-orphans --force-recreate --wait --wait-timeout "$wait_timeout" || true
  exit "$status"
}

sudo -v
cp -p "$env_file" "${env_file}.previous"
write_version "$target_version"
trap rollback ERR

echo "== pulling v$target_version =="
compose pull
echo '== applying migrations =='
compose --profile tools run --rm migrate
echo '== rolling out and waiting for healthchecks =='
compose up -d --remove-orphans --force-recreate --wait --wait-timeout "$wait_timeout"

api_id="$(compose ps -q api)"
web_id="$(compose ps -q web)"
[[ -n "$api_id" && -n "$web_id" ]]
[[ "$(sudo docker inspect -f '{{.Config.Image}}' "$api_id")" == "ghcr.io/brunowinkeler/lists-api:$target_version" ]]
[[ "$(sudo docker inspect -f '{{.Config.Image}}' "$web_id")" == "ghcr.io/brunowinkeler/lists-web:$target_version" ]]

trap - ERR
echo "== deployed v$target_version =="
compose ps