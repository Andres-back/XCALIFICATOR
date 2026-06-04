# XCalificator - despliegue en VPS

Esta guia asume Ubuntu 22.04/24.04 en Contabo, Docker Compose y el repositorio clonado en `/opt/xcalificator`.

## 1. Preparar servidor

```bash
apt update && apt upgrade -y
apt install git nano ufw curl openssl certbot -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

## 2. Clonar o actualizar

```bash
cd /opt
git clone git@github.com:Andres-back/XCALIFICATOR.git xcalificator
cd /opt/xcalificator
```

Para actualizar una instalacion existente:

```bash
cd /opt/xcalificator
git pull origin main
```

## 3. Configurar entorno

```bash
cp .env.production .env
nano .env
```

Valores obligatorios:

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `DATABASE_URL` con la misma clave de Postgres
- `REDIS_URL` con la misma clave de Redis
- `GROQ_API_KEY`
- `JWT_SECRET`
- `VITE_API_URL`
- `TRUSTED_HOSTS`
- `PRESENTON_PUBLIC_URL`
- `PRESENTON_AUTH_PASSWORD`

Generar `JWT_SECRET`:

```bash
openssl rand -hex 32
```

## 4. Certificados HTTPS

Con dominio apuntando al VPS:

```bash
certbot certonly --standalone -d xcalificator.tudominio.com
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/xcalificator.tudominio.com/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/xcalificator.tudominio.com/privkey.pem nginx/ssl/privkey.pem
```

En `.env`:

```env
VITE_API_URL=https://xcalificator.tudominio.com
PRESENTON_PUBLIC_URL=https://xcalificator.tudominio.com/presentations
TRUSTED_HOSTS=xcalificator.tudominio.com,www.xcalificator.tudominio.com,localhost,127.0.0.1,backend
NGINX_CONF=nginx.prod.conf
```

## 5. Prueba temporal por IP

Si aun no tienes dominio ni SSL, puedes probar por HTTP. En `.env` cambia:

```env
VITE_API_URL=http://IP_DEL_VPS
PRESENTON_PUBLIC_URL=http://IP_DEL_VPS/presentations
TRUSTED_HOSTS=IP_DEL_VPS,localhost,127.0.0.1,backend
NGINX_CONF=nginx.http.conf
```

Esto es temporal. Para profesores reales usa HTTPS.

## 6. Levantar

```bash
ENV_FILE=.env docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

Verificar:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
curl http://localhost/health
```

Si usas HTTPS:

```bash
curl https://xcalificator.tudominio.com/health
```

## 7. Logs y mantenimiento

```bash
docker compose --env-file .env -f docker-compose.prod.yml logs -f
docker compose --env-file .env -f docker-compose.prod.yml restart
docker compose --env-file .env -f docker-compose.prod.yml down
```

Backup:

```bash
chmod +x backup.sh
./backup.sh
```

## 8. Publicar cambios futuros

```bash
cd /opt/xcalificator
git pull origin main
ENV_FILE=.env docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```
