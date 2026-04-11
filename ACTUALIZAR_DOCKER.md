# Actualizar Contenedores Docker (XCALIFICATOR)

Guia rapida para actualizar los contenedores del proyecto en entorno local.

## 1) Actualizacion rapida (uso diario)

Cuando cambias codigo de backend/frontend y quieres reconstruir solo esos servicios:

```bash
docker compose up -d --build backend frontend
```

Si agregaste o cambiaste dependencias del frontend (por ejemplo en `package.json`) y aparece un error tipo "Failed to resolve import ...", renueva el volumen de `node_modules` del frontend:

```bash
docker compose up -d --build --force-recreate --renew-anon-volumes frontend
```

Validar estado:

```bash
docker compose ps
docker logs xcalificator_backend --tail 80
docker logs xcalificator_frontend --tail 80
```

## 2) Actualizacion completa (imagenes nuevas o cambios grandes)

Usa esto cuando cambian Dockerfile, dependencias, o base image:

```bash
docker compose pull
docker compose build --no-cache backend frontend
docker compose up -d --force-recreate backend frontend
```

## 3) Si hubo cambios de base de datos

Si agregaste una migracion SQL (ejemplo `backend/db/migrations/...`), ejecutala en Postgres:

```bash
docker exec -i xcalificator_postgres psql -U xcalificator -d xcalificator_db < backend/db/migrations/2026_04_07_tesis_impact.sql
```

Despues, levanta servicios:

```bash
docker compose up -d --build backend frontend
```

## 4) Reinicio total (sin borrar datos)

```bash
docker compose down
docker compose up -d --build
```

## 5) Limpiar cache/imagenes (opcional)

```bash
docker image prune -f
docker builder prune -f
```

## 6) Verificacion final

### Opcion Linux/macOS (curl)

```bash
curl http://localhost/api/health
```

### Opcion PowerShell

```powershell
Invoke-RestMethod http://localhost/api/health
```

Debes ver `status: ok` o `status: degraded` con detalle de dependencias.

## 7) Solo si quieres resetear TODO (incluye datos)

Atencion: esto elimina volumenes (base de datos incluida).

```bash
docker compose down -v
docker compose up -d --build
```
