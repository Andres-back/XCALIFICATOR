# Cloudflare Tunnel - Publicar XCalificator con HTTPS automático

> Reemplaza los puertos abiertos por un túnel seguro de Cloudflare. HTTPS gratis, DDoS protection, IP oculta.

## Requisitos

- Cuenta Cloudflare (ya tienes: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` en `.env`)
- Dominio en Cloudflare (ej: `micolegio.com`)
- Docker Compose (ya lo usas)

## Pasos

### 1. Obtener el token del tunnel

1. Ve a https://dash.teams.cloudflare.com/
2. Inicia sesión con tu cuenta Cloudflare
3. Navega: **Zero Trust** → **Networks** → **Tunnels**
4. Click **Create a tunnel**
5. Selecciona **Cloudflare Tunnel** (la opción por defecto)
6. Ponle nombre: `xcalificator`
7. Te mostrará un comando tipo:
   ```
   cloudflared tunnel run --token eyJhIjoi...
   ```
8. **Copia solo el token** (la parte después de `--token `)
9. Pégalo en `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
   ```

### 2. Configurar el dominio

1. En la misma pantalla, después de crear el tunnel, verás **Configure**
2. En **Public Hostname**, agrega:
   - **Subdomain**: `www` (o déjalo vacío para raíz)
   - **Domain**: `tudominio.com` (el que tengas en Cloudflare)
   - **Type**: `HTTP`
   - **URL**: `http://localhost:80` (apunta a nginx)
3. Si quieres raíz + www, agrega dos hostnames
4. Click **Save tunnel**

### 3. Levantar el tunnel

```bash
# Una vez que CLOUDFLARE_TUNNEL_TOKEN esté en .env, levanta el stack con el perfil cloudflare:
cd D:\DEV\TESIS
docker compose --profile cloudflare up -d

# Verificar que esté corriendo:
docker logs xcalificator_cloudflared --tail 10
# Deberías ver: "Registered tunnel connection"
```

### 4. Verificar HTTPS

```bash
# Esperar 30-60 segundos a que Cloudflare propague
curl -I https://tudominio.com
# Debe responder con: HTTP/2 200 - server: cloudflare
```

## Estructura del tráfico

```
Usuario → https://tudominio.com
              │
              ▼
         Cloudflare Edge (CDN + WAF + HTTPS)
              │
              ▼ (túnel cifrado)
         cloudflared (contenedor Docker)
              │
              ▼ (localhost:80)
         nginx (contenedor Docker)
           ├── /api → backend:8000
           └── /    → frontend:3000
```

## Beneficios

| Sin Tunnel | Con Tunnel |
|---|---|
| IP del VPS visible públicamente | IP oculta por Cloudflare |
| HTTPS requiere certbot manual | HTTPS automático |
| Puertos 80/443/3000 abiertos | Cero puertos abiertos |
| DDoS manual | DDoS mitigation incluido |
| Sin CDN | CDN global con cache |

## Troubleshooting

### El tunnel no arranca
```bash
docker logs xcalificator_cloudflared
# Error común: token inválido → regenerar tunnel en dash.teams.cloudflare.com
```

### DNS no resuelve
```bash
# El tunnel usa Cloudflare DNS automáticamente
# Si ves "ERR_TOO_MANY_REDIRECTS" en el browser, Cloudflare está en modo "Flexible SSL"
# pero nginx espera HTTP → es correcto así. Si usas "Full (strict)", configura SSL en nginx.
```

### CORS bloqueado
```bash
# Si el frontend no puede llamar al API:
# 1. Verificar que PUBLIC_DOMAIN en .env está correcto
# 2. Verificar que CORS_EXTRA_ORIGINS incluye el dominio completo
```

## Variables de entorno nuevas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | Token del tunnel (de dash.teams.cloudflare.com) | `eyJh...` |
| `PUBLIC_DOMAIN` | URL pública del sitio | `https://alexsters.works` |
| `CORS_EXTRA_ORIGINS` | Orígenes CORS adicionales (comma-separated) | `https://app.xcalificator.com,https://admin.xcalificator.com` |
