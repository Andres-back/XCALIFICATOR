#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE."
  exit 1
fi

POSTGRES_USER_VALUE="$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
POSTGRES_DB_VALUE="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"

if [ -z "$POSTGRES_USER_VALUE" ] || [ -z "$POSTGRES_DB_VALUE" ]; then
  echo "POSTGRES_USER o POSTGRES_DB no estan configurados en $ENV_FILE."
  exit 1
fi

echo "Creando backup de base de datos..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER_VALUE" "$POSTGRES_DB_VALUE" > "$BACKUP_DIR/postgres_$STAMP.sql"

echo "Creando backup de uploads..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
  tar czf - -C /app/uploads . > "$BACKUP_DIR/uploads_$STAMP.tar.gz"

echo "Backup creado en $BACKUP_DIR"
