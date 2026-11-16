#!/usr/bin/env bash
# Runs ON THE VPS, invoked by GitHub Actions over SSH:
#   remote-deploy.sh <image> <tag> <registry-user>      (registry token is read from stdin)
# Pulls the new image, restarts the app, waits for its health check and rolls back on failure.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:?usage: remote-deploy.sh <image> <tag> <registry-user>}"
TAG="${2:?missing tag}"
REGISTRY_USER="${3:?missing registry user}"
REGISTRY_TOKEN=""
read -r REGISTRY_TOKEN || true

if [ ! -f .env ]; then
  echo "ERROR: $(pwd)/.env is missing. Run setup-server.sh on the VPS first." >&2
  exit 1
fi

set_env() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

PREVIOUS_TAG="$(grep -E '^APP_TAG=' .env | cut -d= -f2- || true)"
set_env APP_IMAGE "$IMAGE"
set_env APP_TAG "$TAG"

echo "==> Pulling $IMAGE:$TAG"
if [ -n "$REGISTRY_TOKEN" ]; then
  echo "$REGISTRY_TOKEN" | docker login ghcr.io -u "$REGISTRY_USER" --password-stdin > /dev/null
fi
pull_ok=1
docker compose pull app || pull_ok=0
if [ -n "$REGISTRY_TOKEN" ]; then docker logout ghcr.io > /dev/null || true; fi
if [ "$pull_ok" != 1 ]; then
  set_env APP_TAG "$PREVIOUS_TAG"
  echo "ERROR: could not pull the image." >&2
  exit 1
fi

echo "==> Starting containers"
docker compose up -d --remove-orphans

echo "==> Waiting for the app health check"
for _ in $(seq 1 40); do
  cid="$(docker compose ps -q app)"
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2> /dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    echo "==> Deployed $TAG — app is healthy"
    # Keep the current and previous images (for rollback); remove older ones.
    docker images "$IMAGE" --format '{{.Tag}}' \
      | grep -vxE "${TAG}|${PREVIOUS_TAG:-none}|latest|buildcache|<none>" \
      | xargs -r -I{} docker rmi "$IMAGE:{}" > /dev/null 2>&1 || true
    docker image prune -f > /dev/null
    exit 0
  fi
  sleep 3
done

echo "ERROR: the app did not become healthy. Recent logs:" >&2
docker compose logs --tail=80 app >&2 || true
if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$TAG" ] && [ "$PREVIOUS_TAG" != "latest" ]; then
  echo "==> Rolling back to $PREVIOUS_TAG" >&2
  set_env APP_TAG "$PREVIOUS_TAG"
  docker compose up -d app
fi
exit 1
