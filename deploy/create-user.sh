#!/usr/bin/env bash
# Interactively create a production Listly account through the running API
# container. The password is read without echo and never appears in argv.
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${COMPOSE_FILE:-$script_dir/compose.prod.yaml}"
env_file="${APP_ENV_FILE:-$script_dir/.env}"
admin=false

usage() {
  cat <<'EOF'
Usage: ./create-user.sh [--admin]

Interactively creates a user account. Afterward, a list owner can invite the
new account by email from the Sharing section.
EOF
}

case "${1:-}" in
  --admin) admin=true ;;
  --help|-h) usage; exit 0 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac

[[ -f "$compose_file" ]] || {
  echo "ERROR: compose file not found: $compose_file" >&2
  exit 1
}
[[ -f "$env_file" ]] || {
  echo "ERROR: app env file not found: $env_file" >&2
  exit 1
}

read -r -p "Email: " email
read -r -p "Display name: " display_name
email="${email,,}"

[[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  echo 'ERROR: enter a valid email address.' >&2
  exit 1
}
[[ -n "${display_name//[[:space:]]/}" ]] || {
  echo 'ERROR: display name is required.' >&2
  exit 1
}

# Authenticate sudo before disabling terminal echo for the account password.
sudo -v
read -r -s -p "Password (minimum 8 characters): " password
echo
read -r -s -p "Confirm password: " password_confirmation
echo

[[ ${#password} -ge 8 ]] || {
  echo 'ERROR: password must contain at least 8 characters.' >&2
  exit 1
}
[[ "$password" == "$password_confirmation" ]] || {
  echo 'ERROR: passwords do not match.' >&2
  exit 1
}

export CREATE_USER_PASSWORD="$password"
trap 'unset CREATE_USER_PASSWORD password password_confirmation' EXIT

command=(
  sudo --preserve-env=CREATE_USER_PASSWORD
  docker compose --env-file "$env_file" -f "$compose_file"
  exec -T -e CREATE_USER_PASSWORD api
  node dist/scripts/create-user.js
  --email "$email"
  --name "$display_name"
)
if [[ "$admin" == true ]]; then
  command+=(--admin)
fi

"${command[@]}"
echo "Account ready. Invite $email from the desired list's Sharing section."