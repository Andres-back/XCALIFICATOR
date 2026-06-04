#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no esta instalado. Ejecuta: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose no esta disponible."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE. Crea uno con: cp .env.production .env"
  exit 1
fi

get_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

required_vars=(
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  DATABASE_URL
  REDIS_URL
  GROQ_API_KEY
  JWT_SECRET
  VITE_API_URL
  TRUSTED_HOSTS
  PRESENTON_PUBLIC_URL
  PRESENTON_AUTH_PASSWORD
)

missing_vars=()
for var_name in "${required_vars[@]}"; do
  value="$(get_env_value "$var_name")"
  if [ -z "$value" ] || [[ "$value" == *CHANGE_* ]] || [[ "$value" == *your-domain.example* ]]; then
    missing_vars+=("$var_name")
  fi
done

if [ "${#missing_vars[@]}" -gt 0 ]; then
  echo "Configuracion incompleta en $ENV_FILE:"
  printf ' - %s\n' "${missing_vars[@]}"
  exit 1
fi

nginx_conf="$(get_env_value NGINX_CONF)"
nginx_conf="${nginx_conf:-nginx.prod.conf}"

if [ "$nginx_conf" = "nginx.prod.conf" ]; then
  if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then
    echo "Faltan certificados TLS en nginx/ssl/fullchain.pem y nginx/ssl/privkey.pem."
    echo "Para prueba temporal por IP usa NGINX_CONF=nginx.http.conf en $ENV_FILE."
    exit 1
  fi
fi

echo "Desplegando XCalificator con $ENV_FILE y $nginx_conf..."
ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "Estado de servicios:"
ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "Listo."
