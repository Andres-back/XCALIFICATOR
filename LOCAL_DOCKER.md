# XCalificator local desde snapshot de produccion

Esta carpeta queda alineada con `/opt/xcalificator` del VPS. Para desarrollo local se usa `docker-compose.local.yml`, no el compose productivo.

## Arrancar local

```powershell
cd D:\DEV\TESIS
docker compose -f docker-compose.local.yml up -d --build
```

Abrir:

- App: http://localhost:8080
- API directa: http://localhost:8000/api/health
- PostgreSQL local: `localhost:5433`
- Redis local: `localhost:6380`
- pgAdmin local: `docker compose -f docker-compose.local.yml --profile tools up -d pgadmin`, luego http://localhost:5050

## Variables locales

El archivo `.env.local` es solo para desarrollo local y esta ignorado por git. Si necesitas probar IA:

- `OPEN_CODE_API_KEY`
- `GROQ_API_KEY`
- `OLLAMA_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

No pegues llaves productivas en archivos que vayas a commitear.

## Parar local

```powershell
cd D:\DEV\TESIS
docker compose -f docker-compose.local.yml down
```

Para borrar tambien la base local:

```powershell
docker compose -f docker-compose.local.yml down -v
```

## Flujo recomendado

1. Trabajar cambios en `D:\DEV\TESIS`.
2. Probar con `docker compose -f docker-compose.local.yml up -d --build`.
3. Validar `http://localhost:8080` y `http://localhost:8000/api/health`.
4. Subir a produccion usando el procedimiento de deploy, sin copiar `docker-compose.local.yml` ni `.env.local` al VPS.
