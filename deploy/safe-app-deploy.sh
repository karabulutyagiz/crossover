#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/crossover}"
cd "$APP_DIR"

read_rooms() {
  docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/health').then(async (r) => { const j = await r.json(); process.stdout.write(String(j.rooms ?? -1)); }).catch(() => process.stdout.write('-1'))"
}

require_empty_rooms() {
  label="$1"
  rooms="$(read_rooms)"
  if [ "$rooms" != "0" ]; then
    printf '%s\n' "Deploy stopped: active rooms=$rooms ($label). Wait until rooms=0, then retry."
    exit 2
  fi
  printf '%s\n' "Rooms check passed: rooms=0 ($label)."
}

require_empty_rooms "before build"
docker compose build app
require_empty_rooms "before restart"
docker compose up -d app
docker compose ps
