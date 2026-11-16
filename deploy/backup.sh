#!/usr/bin/env bash
# Backs up the MongoDB database and uploaded knowledge files; keeps 14 days.
# Run daily from cron (as the deploy user):
#   30 2 * * * bash /opt/chatbot/backup.sh >> /opt/chatbot/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups

docker compose exec -T mongo mongodump \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  --db chatbot_builder --archive --gzip > "backups/mongo-$STAMP.archive.gz"

docker run --rm -v chatbot_uploads:/data/uploads:ro -v "$(pwd)/backups:/backup" alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz" -C /data uploads

find backups -name 'mongo-*.archive.gz' -mtime +14 -delete
find backups -name 'uploads-*.tar.gz' -mtime +14 -delete
echo "$(date -Is) backup $STAMP complete"
