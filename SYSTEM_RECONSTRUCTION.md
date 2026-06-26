# XCalificator — System Reconstruction Guide

> **Propósito:** Este documento describe el sistema completo con suficiente detalle para
> que otro agente de IA pueda reconstruirlo desde cero, sin errores y tomando las decisiones
> de diseño correctas desde el inicio. Incluye lecciones aprendidas, errores conocidos y
> sus soluciones, y los puntos no evidentes del sistema.

---

## 1. ¿Qué es XCalificator?

**XCalificator** es una plataforma educativa web para instituciones de educación secundaria
colombianas. Es el producto de una tesis de ingeniería. Su objetivo es reducir el tiempo que
los profesores dedican a crear, aplicar y calificar exámenes mediante IA.

**Usuarios:**
- **Admin** — gestiona usuarios, configuración global de IA, feature flags
- **Profesor** — crea materias, diseña exámenes con IA, califica con OCR, genera presentaciones
- **Estudiante** — resuelve exámenes online, consulta notas, chatea con Xali (IA tutora)

**URL producción:** `https://xcalificator.alexsters.works`  
**URL local:** `http://localhost:8080`  
**URL Presenton local:** `http://localhost:5001`

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend API | FastAPI 0.115 + Uvicorn (async) |
| ORM | SQLAlchemy 2.0 async (`asyncpg`) |
| Base de datos | PostgreSQL 16 Alpine |
| Cache / Rate-limiting | Redis 7 Alpine |
| OCR / Visión | Qwen3.7 Plus vía Open Code (`open_code_vision_json`) — sin microservicio externo |
| Generador IA slides | Presenton (imagen Docker personalizada) |
| Frontend | React 18 + Vite 5 + TailwindCSS 3 |
| State management | Zustand 4 |
| HTTP cliente | Axios 1.7 |
| Proxy reverso local | nginx Alpine |
| Proxy reverso producción | nginx Alpine (HTTPS + SSL Let's Encrypt) |
| Containerización | Docker Compose |
| Deploy CI/CD | Komodo (webhook en `deploy.alexsters.works`) |
| Monitoreo | Netdata (`netdata.alexsters.works`) |
| DB Admin | pgAdmin 4 (`pgadmin.alexsters.works`) |

---

## 3. Arquitectura de servicios

```
Internet (HTTPS 443)
        │
   nginx (producción)
   nginx:local.conf (local puerto 8080)
        │
   ┌────┴──────────────┬──────────────────┐
   │                   │                  │
/api/*              /uploads/*          /*
   │                   │                  │
backend:8000       backend:8000      frontend:80
(FastAPI)          (static files)    (React SPA)
   │
   ├── postgres:5432
   ├── redis:6379
   ├── paddleocr:8001
   └── presenton:80 (perfil "presenton", solo cuando activo)
         └── LLM externo (OpenCode / Groq / Qwen)
```

**Red Docker (producción):** `alexsters_shared` (compartida con otros proyectos en el VPS).  
**Red Docker (local):** red por defecto del compose local.

---

## 4. Estructura de archivos

```
D:/DEV/TESIS/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py          # Settings con pydantic-settings
│   │   │   ├── database.py        # Engine SQLAlchemy async + get_db
│   │   │   ├── dependencies.py    # get_current_user, require_role, get_client_ip
│   │   │   ├── security.py        # JWT, bcrypt, tokens
│   │   │   ├── redis.py           # Cliente Redis async
│   │   │   ├── ai_provider_config.py  # Lógica multi-proveedor IA (Groq/Ollama/OpenCode)
│   │   │   └── tool_flags.py      # Feature flags herramientas por materia
│   │   ├── models/
│   │   │   └── models.py          # Todos los modelos SQLAlchemy
│   │   ├── routers/
│   │   │   ├── auth.py            # /auth/*
│   │   │   ├── admin.py           # /admin/*
│   │   │   ├── materias.py        # /materias/*
│   │   │   ├── examenes.py        # /examenes/*
│   │   │   ├── grading.py         # /grading/*
│   │   │   ├── generation.py      # /generation/* (generación IA de examenes)
│   │   │   ├── presentaciones.py  # /presentaciones/*
│   │   │   ├── herramientas.py    # /herramientas/*
│   │   │   ├── chat.py            # /chat/*
│   │   │   ├── notifications.py   # /notifications/*
│   │   │   ├── ai_assets.py       # /ai-assets/*
│   │   │   ├── periodos.py        # /periodos/*
│   │   │   ├── asistencia.py      # /asistencia/*
│   │   │   ├── reportes.py        # /reportes/*
│   │   │   ├── grupos.py          # /grupos/*
│   │   │   ├── tesis.py           # /tesis/* (métricas de impacto)
│   │   │   ├── xali_master.py     # /xali-master/* (IA asistente profesor)
│   │   │   └── telegram.py        # /telegram/* (bot Telegram)
│   │   ├── schemas/
│   │   │   └── schemas.py         # Pydantic schemas entrada/salida
│   │   ├── services/
│   │   │   ├── groq_service.py    # Wrapper Groq API
│   │   │   ├── ocr_service.py     # Cliente PaddleOCR + fallback Groq/Ollama
│   │   │   ├── pdf_service.py     # Extracción texto PDF (PyMuPDF + pdfplumber)
│   │   │   ├── presenton_service.py  # Integración Presenton (ver sección 8)
│   │   │   ├── presentation_service.py  # Wrapper alto nivel presentaciones
│   │   │   ├── vision_grading_service.py  # Calificación visual OCR
│   │   │   ├── curriculum_service.py   # RAG documentos curriculares (DBA)
│   │   │   ├── open_code_service.py    # Gateway OpenCode (OpenAI-compatible)
│   │   │   └── notification_service.py # Email + Telegram
│   │   └── main.py                # App FastAPI, CORS, monta routers
│   ├── db/
│   │   └── init.sql               # Schema completo PostgreSQL (se ejecuta en primer arranque)
│   ├── Dockerfile                 # Python 3.11 slim, instala requirements.txt
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Router React con lazy loading
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Perfil.jsx
│   │   │   ├── NotFound.jsx
│   │   │   ├── admin/
│   │   │   │   └── AIConfig.jsx
│   │   │   ├── profesor/
│   │   │   │   ├── Materias.jsx       # Crear materia + modal bottom-sheet
│   │   │   │   ├── Examenes.jsx       # CRUD examenes
│   │   │   │   ├── Calificar.jsx      # Calificación OCR
│   │   │   │   ├── Presentaciones.jsx # Galería presentaciones
│   │   │   │   ├── Presentacion.jsx   # Crear nueva presentación (formulario)
│   │   │   │   └── XaliMaster.jsx     # Asistente IA profesor
│   │   │   └── estudiante/
│   │   │       ├── ResolverExamen.jsx # UI de examen online
│   │   │       └── ...
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   └── index.css
│   ├── Dockerfile                 # Multi-stage: Node 20 Alpine build → nginx 1.27 Alpine serve
│   ├── Dockerfile.prod
│   ├── nginx.conf                 # nginx interno del contenedor frontend (sirve /app/dist)
│   └── package.json
├── paddleocr/
│   └── Dockerfile                 # Python + PaddleOCR, expone puerto 8001
├── presenton_patches/
│   ├── Dockerfile                 # Extiende ghcr.io/presenton/presenton:latest
│   ├── llmai_patch.py             # Monkey-patch para compatibilidad Qwen/Alibaba JSON
│   └── fastapi/
│       ├── llmai_patch.py
│       ├── api/
│       │   ├── main.py            # Inyecta llmai_patch al inicio
│       │   ├── middlewares.py     # Basic Auth middleware
│       │   └── v1/ppt/endpoints/
│       │       └── presentation.py
│       └── utils/llm_calls/
│           ├── generate_presentation_outlines.py
│           └── generate_presentation_structure.py
├── nginx/
│   ├── nginx.conf                 # Producción (HTTPS, múltiples subdominios VPS)
│   └── nginx.local.conf           # Local (HTTP solo, puerto 80 interno)
├── docker-compose.yml             # Producción
├── docker-compose.local.yml       # Desarrollo local
├── .env.example                   # Plantilla variables de entorno
├── .env                           # Variables reales (NO committed)
└── .env.local                     # Secretos locales (gitignored)
```

---

## 5. Variables de entorno

**Copia `.env.example` a `.env` y completa todos los valores. NUNCA commitear `.env`.**

```env
# PostgreSQL
POSTGRES_USER=xcalificator
POSTGRES_PASSWORD=<password_largo_aleatorio>
POSTGRES_DB=xcalificator_db
DATABASE_URL=postgresql+asyncpg://xcalificator:<password>@postgres:5432/xcalificator_db

# Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=<password_redis>   # requerido en producción

# JWT
JWT_SECRET=<string_64_chars_aleatorio>
JWT_EXPIRY=3600          # 1 hora access token
JWT_REFRESH_EXPIRY=604800  # 7 días refresh token

# Groq API (modelo LLM principal)
GROQ_API_KEY=gsk_XXXX

# Google OAuth 2.0 (login social)
GOOGLE_CLIENT_ID=XXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-XXXX
VITE_GOOGLE_CLIENT_ID=XXXX.apps.googleusercontent.com

# SMTP Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=<app_password_gmail>

# OCR
OCR_SERVICE_URL=http://paddleocr:8001
OCR_OLLAMA_MODEL=gemma3
OCR_GROQ_FALLBACK_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Ollama (local o cloud)
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_API_KEY=
OLLAMA_CLOUD_URL=https://ollama.com
OLLAMA_CLOUD_API_KEY=

# Open Code (gateway OpenAI-compatible, usado para contenido e IA)
OPEN_CODE_BASE_URL=https://opencode.ai/zen/go/v1
OPEN_CODE_API_KEY=<key>
OPEN_CODE_CONTENT_MODEL=DeepSeek V4 Flash
OPEN_CODE_VISION_MODEL=Qwen3.7 Plus

# Presenton (generador presentaciones)
PRESENTON_URL=http://presenton:80             # URL interna Docker
PRESENTON_PUBLIC_URL=http://localhost:5001    # URL pública para editar slides
PRESENTON_TIMEOUT=600                          # segundos; debe ser > tiempo de generación (~220s)
PRESENTON_LLM=custom
PRESENTON_CUSTOM_LLM_URL=https://opencode.ai/zen/go/v1
PRESENTON_CUSTOM_MODEL=qwen3.7-plus
PRESENTON_AUTH_USERNAME=xcalificator
PRESENTON_AUTH_PASSWORD=<password_presenton>
# PRESENTON_CUSTOM_LLM_API_KEY se pasa al contenedor directamente; NUNCA al .env committed
# En docker-compose.local.yml: environment: PRESENTON_CUSTOM_LLM_API_KEY: ${PRESENTON_CUSTOM_LLM_API_KEY}
# Y en .env.local (gitignored): PRESENTON_CUSTOM_LLM_API_KEY=<key>

# Dominio (producción)
PUBLIC_DOMAIN=xcalificator.alexsters.works
CORS_EXTRA_ORIGINS=https://xcalificator.alexsters.works

# Frontend (Vite)
VITE_API_URL=                   # vacío = relativo (/api/)
VITE_DEV_PROXY_TARGET=http://localhost:8000
```

### Regla crítica de seguridad: PRESENTON_CUSTOM_LLM_API_KEY

Esta key NO debe aparecer en ningún archivo committed. El flujo correcto es:

1. Crear `.env.local` (gitignored):
   ```
   PRESENTON_CUSTOM_LLM_API_KEY=sk-xxx
   ```
2. En `docker-compose.local.yml` dentro del servicio `presenton`:
   ```yaml
   env_file:
     - .env.local
   environment:
     CUSTOM_LLM_API_KEY: ${PRESENTON_CUSTOM_LLM_API_KEY}
   ```

---

## 6. Docker Compose

### Local (`docker-compose.local.yml`)

```yaml
services:
  postgres:        # puerto expuesto: 5433:5432
  redis:           # sin puerto expuesto
  backend:         # hot-reload: volumen ./backend:/app
  frontend:        # build estático: NO hot-reload; rebuild obligatorio tras cambios
  paddleocr:
  presenton:       # perfil "presenton" — activar con --profile presenton
  nginx:           # puerto 8080:80 → reverse proxy

volumes:
  pgdata:
  uploads:
  presenton_data:
  presenton_chrome:
```

**Comandos más usados (local):**

```bash
# Primer arranque
docker-compose -f docker-compose.local.yml --profile presenton up -d

# Rebuild frontend tras cambios de código
docker-compose -f docker-compose.local.yml build frontend
docker-compose -f docker-compose.local.yml up -d --no-deps frontend

# Solo cambios backend (con hot-reload ya activo via volumen)
docker-compose -f docker-compose.local.yml restart backend

# Recargar nginx sin reiniciar (tras cambios en nginx.local.conf)
docker exec xcalificator_local_nginx sh -c "nginx -t && nginx -s reload"

# Logs en tiempo real
docker-compose -f docker-compose.local.yml logs -f backend
docker-compose -f docker-compose.local.yml logs -f presenton
```

### Producción (`docker-compose.yml`)

Igual que local pero:
- nginx sirve HTTPS (443) con certificados Let's Encrypt en `./certbot/conf`
- Red `alexsters_shared` compartida con otros proyectos del VPS
- El backend NO monta volumen de código (imagen inmutable)
- Presenton activo con perfil `presenton`

---

## 7. Base de datos — Schema completo

Archivo: `backend/db/init.sql` (ejecutado automáticamente por PostgreSQL en primer arranque del volumen vacío).

### Tablas principales

```sql
-- Autenticación y usuarios
users (id UUID PK, nombre, apellido, documento UNIQUE, correo UNIQUE, 
       celular, password_hash, rol CHECK('admin','profesor','estudiante'),
       foto_url, bio, confirmed, telegram_chat_id, created_at)

sesiones (id UUID PK, user_id FK, ip, dispositivo, fecha_inicio, fecha_fin)

-- Académico
materias (id UUID PK, nombre, descripcion, grado, profesor_id FK,
          horario jsonb, created_at)

materia_encuentros (id, materia_id FK, dia_semana, hora_inicio, hora_fin, orden)

matriculas (id, estudiante_id FK, materia_id FK, activa, fecha_ingreso)

periodos_academicos (id, nombre, fecha_inicio, fecha_fin, activo, materia_id FK)

examenes (id UUID PK, titulo, descripcion, tipo CHECK('presencial','online'),
          materia_id FK, fecha_aplicacion, duracion_minutos,
          contenido_json jsonb,  -- preguntas estructuradas
          nota_maxima DECIMAL, ponderacion DECIMAL, estado,
          modo_grupal BOOLEAN, max_integrantes INTEGER, created_at)

notas (id UUID PK, estudiante_id FK, examen_id FK, materia_id FK,
       calificacion DECIMAL, retroalimentacion TEXT,
       estado CHECK('pendiente','calificado','revisado'),
       fecha_calificacion, observaciones)

respuestas_online (id UUID PK, estudiante_id FK, examen_id FK,
                   respuestas jsonb, submitted_at)

-- Herramientas IA (galería de artefactos generados)
herramientas (id UUID PK, profesor_id FK, materia_id FK,
              tipo CHECK('examen','presentacion','taller','sopa_letras',...),
              titulo, contenido jsonb, estado, created_at)

tool_feature_flags (id, materia_id FK, herramienta_tipo, habilitado)

-- Asistencia
asistencia (id, estudiante_id FK, materia_id FK, fecha DATE,
            presente BOOLEAN, justificada BOOLEAN, observacion)

-- Boletines
boletines (id UUID PK, estudiante_id FK, materia_id FK, periodo_id FK,
           nota_final DECIMAL, inasistencias INTEGER,
           fortalezas TEXT, debilidades TEXT, generado_con_ia BOOLEAN)

-- Chat y IA
chat_history (id, user_id FK, materia_id FK, mensaje TEXT, respuesta TEXT,
              tokens_usados INTEGER, created_at)

chat_sessions (id UUID PK, estudiante_id FK, nota_id FK,
               cerrada BOOLEAN, preguntas_usadas INTEGER, inicio TIMESTAMPTZ)

api_usage_log (id, user_id FK, endpoint, tokens, modelo, costo_estimado, created_at)

-- Configuración IA
ai_global_config (id, proveedor, api_key_cifrada, modelo_defecto, activo, updated_at)

profesor_ai_configs (id, profesor_id FK UNIQUE, proveedor,
                     base_url, api_key, modelo, updated_at)

-- Notificaciones
preferencias_notif (id, user_id FK UNIQUE, acepta_email, acepta_telegram)

notificaciones (id, user_id FK, tipo, titulo, mensaje, leida, created_at)

-- Grupos
grupos_actividad (id UUID PK, nombre, examen_id FK, materia_id FK,
                  max_integrantes INTEGER, created_at)

miembros_grupo (id, grupo_id FK, estudiante_id FK, rol)

-- Currículum RAG
-- Los documentos DBA se almacenan como archivos en /uploads/materias/{id}/curriculo/
-- y se indexan en memoria (no hay tabla dedicada)

-- Tesis — métricas de impacto
tiempos_evaluacion (id UUID PK, profesor_id FK, materia_id FK, examen_id FK,
                    fase CHECK('sin_sistema','con_sistema'),
                    actividad_tipo, grupo_pareado,
                    duracion_minutos DECIMAL, estudiantes_evaluados INTEGER,
                    observacion TEXT, created_at)

encuestas_impacto (id UUID PK, user_id FK, rol, hito,
                   claridad 1-5, utilidad 1-5, pertinencia 1-5,
                   satisfaccion 1-5, facilidad_uso 1-5,
                   comentario TEXT, consentimiento BOOLEAN)

-- Audit
audit_log (id, user_id FK, accion, entidad, entidad_id, detalle jsonb, created_at)
```

### Usuario administrador por defecto

```sql
-- correo: admin@xcalificator.com  |  password: Admin123!
INSERT INTO users (nombre, apellido, documento, correo, password_hash, rol)
VALUES ('Admin', 'Sistema', '00000000', 'admin@xcalificator.com',
        '$2b$12$P3QJbu.k5O0cU.n45QKS5e7OSRfqFOQXd/hRoc05UZvoPbgGIXWaq', 'admin');
```

---

## 8. Backend — Routers y endpoints clave

### Autenticación (`/api/auth/*`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Registro estudiante; devuelve `{access_token, refresh_token, user}` |
| POST | `/auth/login` | Login email+password; devuelve igual |
| POST | `/auth/refresh` | Renueva access token con refresh token |
| POST | `/auth/google` | Login con Google OAuth ID token |
| GET | `/auth/me` | Perfil del usuario actual |
| PUT | `/auth/me` | Actualizar perfil |
| PUT | `/auth/me/password` | Cambiar contraseña propia |

**Auth headers:** `Authorization: Bearer <access_token>`

**localStorage frontend (obligatorio — los 3 o la app redirige a /login):**
```javascript
localStorage.setItem('access_token', body.access_token);
localStorage.setItem('refresh_token', body.refresh_token);
localStorage.setItem('user', JSON.stringify(body.user));
```

### Materias (`/api/materias/*`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/materias/` | profesor | Lista materias del profesor |
| POST | `/materias/` | profesor | Crear materia (con encuentros y config) |
| GET | `/materias/{id}` | profesor | Detalle materia |
| PUT | `/materias/{id}` | profesor | Actualizar materia |
| DELETE | `/materias/{id}` | profesor | Eliminar materia |
| POST | `/materias/{id}/curriculo/documentos` | profesor | Subir PDF/imagen DBA |
| GET | `/materias/{id}/curriculo/documentos` | profesor | Listar documentos DBA |
| GET | `/materias/{id}/estudiantes` | profesor | Lista estudiantes matriculados |
| POST | `/materias/{id}/matricula` | estudiante | Matricularse |

### Exámenes (`/api/examenes/*`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/examenes/` | profesor | Lista exámenes del profesor |
| POST | `/examenes/` | profesor | Crear examen manual |
| GET | `/examenes/{id}` | * | Detalle examen |
| PUT | `/examenes/{id}` | profesor | Actualizar examen |
| DELETE | `/examenes/{id}` | profesor | Eliminar examen |
| POST | `/examenes/{id}/respuestas` | estudiante | Enviar respuestas online |
| GET | `/examenes/{id}/resultado` | estudiante | Ver resultado propio |

### Generación IA (`/api/generation/*`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/generation/examen` | Genera examen completo con IA (Groq/OpenCode) |
| POST | `/generation/digitalizar` | Digitaliza examen físico (imagen→JSON) via OCR+IA |
| POST | `/generation/mejorar` | Mejora pregunta individual con IA |

### Calificación (`/api/grading/*`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/grading/ocr` | Califica examen físico subiendo imagen; usa PaddleOCR → Groq/Ollama |
| POST | `/grading/vision` | Calificación con modelo de visión (Ollama Cloud o Groq Vision) |
| POST | `/grading/manual` | Guardar calificación manual |
| GET | `/grading/{nota_id}/retroalimentacion` | Genera feedback IA para la nota |

**Tipos interactivos soportados en OCR/Vision:**
```python
INTERACTIVE_TYPES = {"sopa_letras", "crucigrama", "emparejar"}
# TODO: agregar "unir_columnas" cuando se implemente
```

### Presentaciones (`/api/presentaciones/*`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/presentaciones/clase` | Genera slides para una clase (→ Presenton, ~220s) |
| POST | `/presentaciones/repaso` | Slides de repaso de examen |
| POST | `/presentaciones/periodo` | Slides resumen período académico |
| GET | `/presentaciones/mias` | Lista presentaciones del profesor |
| GET | `/presentaciones/health` | Smoke test Presenton |

**Request body `/presentaciones/clase`:**
```json
{
  "titulo": "Suma y Resta de Fracciones",
  "contenido": "Material base del docente...",
  "grado": "6°",
  "objetivos": ["Comprender fracciones", "Aplicar suma"],
  "num_slides": 8,
  "plantilla": "general",
  "materia_id": "uuid-opcional"
}
```

**Response (201):**
```json
{
  "id": "uuid-herramienta",
  "titulo": "...",
  "pptx_url": "/uploads/presentations/<id>.pptx",
  "edit_url": "http://localhost:5001/presentation?id=<presenton-id>",
  "thumbnails": [],
  "num_slides": 8,
  "plantilla": "general",
  "subtipo": "clase",
  "created_at": "..."
}
```

### XaliMaster (`/api/xali-master/*`)

Asistente IA para profesores. Accede al contexto de la materia (estudiantes, exámenes, notas) y puede sugerir acciones (navegar a otra sección del sistema).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/xali-master/chat` | Envía mensaje; responde en markdown con acciones sugeridas |
| GET | `/xali-master/session` | Estado sesión de chat |

### Herramientas (`/api/herramientas/*`)

Galería de artefactos IA generados (examenes, presentaciones, sopas de letras, etc.).

### Admin (`/api/admin/*`)

Gestión de usuarios, configuración global IA, estadísticas, feature flags.

### Tesis (`/api/tesis/*`)

Endpoints para registrar tiempos de evaluación y encuestas de impacto. Solo para métricas de la investigación.

---

## 9. Integración Presenton (Generador de Slides IA)

### Qué es Presenton

[Presenton](https://github.com/presenton/presenton) es un generador de presentaciones PPTX basado en IA. Corre en su propio contenedor Docker con:
- **nginx en puerto 80** (proxy reverso + autenticación)
- **FastAPI en puerto 8000** (API interna)
- **Next.js en puerto 3000** (UI editor de slides)
- **Puppeteer/Chrome** (genera imágenes de slides como thumbnails)

### Por qué necesita imagen personalizada

El `ghcr.io/presenton/presenton:latest` oficial **no incluye las librerías de sistema** que Chrome/Puppeteer necesita en Ubuntu/Debian. El `presenton_patches/Dockerfile` las instala:

```dockerfile
FROM ghcr.io/presenton/presenton:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 \
    libpangocairo-1.0-0 libcairo2 libnspr4 libnss3 libgbm1 libasound2t64

# Pre-instala Chrome 146 en el volumen named (para no re-descargarlo en cada rebuild)
RUN PUPPETEER_CACHE_DIR=/root/.cache/puppeteer \
    npx puppeteer@22 browsers install 'chrome@146.0.7680.76'
```

**IMPORTANTE:** `libasound2t64` es el nombre correcto en Ubuntu 24.04 (Debian bookworm). En versiones anteriores se llamaba `libasound2`. Usar el nombre equivocado falla silenciosamente.

### Patches de compatibilidad Qwen/Alibaba

Presenton usa `llmai` internamente con `JSONSchemaResponse(strict=True)`. Las APIs de Alibaba (Qwen) vía OpenCode **no respetan JSON Schema estricto** sin una instrucción explícita en el prompt. El patch:

`presenton_patches/fastapi/llmai_patch.py` — monkey-patch al `OpenAIClient.generate` de `llmai`:
- Si hay `response_format` pero el texto de los mensajes no contiene "json", inyecta `"Output must be valid json."` al system message.

Este patch se aplica porque `presenton_patches/fastapi/api/main.py` importa y ejecuta `llmai_patch` al inicio.

Los demás patches en `presenton_patches/fastapi/` se montan como volúmenes read-only sobre el contenedor, sobrescribiendo los archivos originales sin rebuild.

### Variables de entorno Presenton

```
LLM=custom
CUSTOM_LLM_URL=https://opencode.ai/zen/go/v1
CUSTOM_MODEL=qwen3.7-plus
CUSTOM_LLM_API_KEY=<key>          # SECRETO — solo via .env.local
DISABLE_IMAGE_GENERATION=true
APP_DATA_DIRECTORY=/app_data
CAN_CHANGE_KEYS=false
AUTH_USERNAME=xcalificator
AUTH_PASSWORD=xcalificator-dev-only
AUTH_OVERRIDE_FROM_ENV=true
```

### Flujo de generación (backend → Presenton)

```
POST /api/presentaciones/clase
    ↓
presentaciones.py router
    ↓
presenton_service.generate_lesson_presentation()
    ↓
_build_lesson_prompt()   # construye prompt en español
    ↓
_generate_with_prompt()
    ↓
POST http://presenton:80/api/v1/ppt/presentation/generate
    {content, n_slides, language:"Spanish", template, export_as:"pptx",
     include_title_slide:true, instructions:"FORMATO OBLIGATORIO: sin LaTeX..."}
    (Basic Auth: AUTH_USERNAME:AUTH_PASSWORD)
    ↓
    ~220s después...
    ↓
{presentation_id, path:"/app_data/exports/XXX.pptx", edit_path:"/presentation?id=XXX"}
    ↓
_download_and_store_pptx()   # descarga PPTX y lo guarda en /uploads/presentations/
    (usa cookie de sesión Presenton — ver _ensure_token())
    ↓
Respuesta al frontend: {pptx_url:"/uploads/...", edit_url:"http://localhost:5001/presentation?id=..."}
```

### Tiempos y timeouts

| Componente | Valor | Dónde configurar |
|---|---|---|
| nginx proxy_read_timeout | **660s** | `nginx/nginx.local.conf` y `nginx/nginx.conf` |
| nginx proxy_send_timeout | **660s** | ídem |
| Backend PRESENTON_TIMEOUT | **600s** | `PRESENTON_TIMEOUT=600` en `.env` |
| Tiempo real de generación | ~220s | Depende del modelo LLM externo |

**ERROR CRÍTICO CONOCIDO:** Si `proxy_read_timeout` en nginx es menor al tiempo de generación, nginx devuelve **504 Gateway Timeout** con este log:
```
upstream timed out (110: Operation timed out) while reading response header from upstream
```
El valor por defecto de nginx es **180s** — insuficiente. Siempre configurar a mínimo 660s.

### Fallo transitorio del LLM (error conocido)

A veces Presenton recibe del LLM un JSON inválido como `{"title": "content"}` en lugar del outline correcto. Esto causa un error 400/500 con:
```
input_value={'title': 'content'}  ValidationError: PresentationOutlineModel
```
**No es un bug del código** — es un fallo de la API LLM externa. La solución es **reintentar** la petición. Considerar agregar retry automático en `presenton_service.py`.

---

## 10. Frontend — Páginas y flujo

### React Router (App.jsx)

```
/                     → Landing.jsx
/login                → Login.jsx  
/register             → Register.jsx
/perfil               → Perfil.jsx (requiere auth)

/admin/*              → rol admin
  /admin              → Dashboard.jsx
  /admin/users        → Users.jsx
  /admin/materias     → Materias.jsx
  /admin/periodos     → Periodos.jsx
  /admin/boletines    → Boletines.jsx
  /admin/ai-config    → AIConfig.jsx
  /admin/audit        → AuditLog.jsx
  /admin/impacto      → ImpactoTesis.jsx

/profesor/*           → rol profesor
  /profesor/materias              → Materias.jsx
  /profesor/materia/:materiaId    → MateriaDetail.jsx
  /profesor/examenes/:materiaId   → Examenes.jsx
  /profesor/calificar/:examenId   → Calificar.jsx
  /profesor/notas/:examenId       → Notas.jsx
  /profesor/herramientas          → Herramientas.jsx  ← HUB ÚNICO (tabs Evaluaciones / Presentaciones)
  /profesor/crear-examen-chat     → CrearExamenChat.jsx  (accesible desde Herramientas tab 1)
  /profesor/evaluacion-rapida     → EvaluacionRapida.jsx (accesible desde Herramientas tab 1)
  /profesor/presentacion          → GenerarPresentacion.jsx (accesible desde Herramientas tab 2)
  /profesor/presentaciones        → MisPresentaciones.jsx  (mantenido como ruta directa, embedido en tab 2)
  /profesor/xali-master           → XaliMaster.jsx
  /profesor/reportes              → Reportes.jsx
  /profesor/impacto               → ImpactoTesis.jsx

/estudiante/*         → rol estudiante
  /estudiante                   → Home.jsx
  /estudiante/notas             → Notas.jsx
  /estudiante/examen/:examenId  → ResolverExamen.jsx
  /estudiante/chat/:notaId      → Chat.jsx
  /estudiante/boletin           → Boletin.jsx

/encuesta/impacto     → EncuestaImpacto.jsx (todos los roles)
```

### Sidebar del profesor (NAV_ITEMS)

```javascript
// Layout.jsx — solo estos items aparecen para rol "profesor":
{ label: 'Materias',      path: '/profesor/materias',     icon: BookOpen   }
{ label: 'Herramientas',  path: '/profesor/herramientas', icon: Wrench     }  // hub único
{ label: 'Xali Master',   path: '/profesor/xali-master',  icon: Bot        }
{ label: 'Reportes',      path: '/profesor/reportes',     icon: BarChart3  }
{ label: 'Impacto Tesis', path: '/profesor/impacto',      icon: ClipboardList }
```

> ⚠️ "Presentaciones" fue eliminado del sidebar en junio 2026. Toda la funcionalidad de presentaciones vive en `/profesor/herramientas` tab "Presentaciones".

### Herramientas.jsx — Arquitectura de la página hub

`Herramientas.jsx` es la **única entrada** para toda la tooling del profesor. Tiene dos tabs:

#### Tab 1 — "Evaluaciones y Actividades"
- Header CTA: **"Generar con IA"** → abre modal de generación (crucigrama, sopa, examen, etc.)
- 2 cards de acceso rápido:
  - **"Diseñar con chat IA"** → navega a `/profesor/crear-examen-chat`
  - **"Digitalización rápida"** → navega a `/profesor/evaluacion-rapida`
- Grid de herramientas generadas (filtrable por tipo): `GET /herramientas/`
- Modal Generar: wizard 3 pasos → `POST /herramientas/generate`
- Modal Asignar: `POST /herramientas/:id/assign`
- Modal Editar: `PUT /herramientas/:id`

#### Tab 2 — "Presentaciones"
- Header CTA: **"Nueva presentación"** → navega a `/profesor/presentacion`
- Filtros: Todas / Clases / Repasos / Boletines
- Grid de `PresentationCard` (thumbnail, título, subtipo, fecha, acciones)
  - Descargar PPTX: `pres.pptx_url` (enlace directo)
  - Editar en Presenton: `GET /presentaciones/presenton-token` → inyecta cookie → `window.open(pres.edit_url)`
  - Eliminar: `DELETE /presentaciones/:id`
- Carga datos en: `useEffect(() => { if (activeTab === 'presentaciones') fetchPresentaciones(); }, [activeTab])`

#### Estado principal (Herramientas.jsx)
```javascript
// Tab control
activeTab: 'evaluaciones' | 'presentaciones'

// Tools (tab 1)
herramientas, materias, loading, toolFlags
showGenerate, showAssign, preview, deleteConfirm, editModal
genForm, genStep, examPreset, assignForm, editForm, saving

// Presentations (tab 2)
presentaciones, loadingPres, deletePres, openingEditor, filterPres
```

### Frontend Build (IMPORTANTE)

El `frontend/Dockerfile` hace un **build estático** de Vite en tiempo de imagen. No hay hot-reload con volumen. Cada cambio de código requiere rebuild:

```bash
docker-compose -f docker-compose.local.yml build frontend
docker-compose -f docker-compose.local.yml up -d --no-deps frontend
```

### Modal "Nueva Materia" — diseño mobile-first

`Materias.jsx` tiene un modal bottom-sheet mobile / centered desktop:

```jsx
// Contenedor principal
<div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
  // Modal
  <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl 
                  flex flex-col max-h-[93vh]">
    // Drag handle (mobile only)
    <div className="sm:hidden w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-2" />
    // Encabezado sticky
    <div className="sticky top-0 bg-white px-6 py-4 border-b">...</div>
    // Cuerpo scrollable
    <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
      // 5 secciones numeradas con badge circular
    </div>
    // Footer sticky con botones
    <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
      <button>Cancelar</button>
      <button>Crear Materia</button>
    </div>
  </div>
</div>
```

**Encuentros:** Layout `badge + select día` en fila, luego `grid-cols-2` para hora inicio/fin. Permite hasta 7+ encuentros con scroll.

**DBA:** Textarea + divider "o sube un archivo" + zona de drop (dashed border, Upload icon, acepta `.pdf .png .jpg .jpeg .webp`). Cada materia tiene su propio DBA — los documentos se suben post-creación a `/materias/{id}/curriculo/documentos`.

### Autenticación frontend

```javascript
// Todos los requests usan interceptor Axios
// Si 401 → intenta refresh → si falla → logout
headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
```

El refresh token (`refresh_token` en localStorage) renueva el access token automáticamente.

---

## 11. nginx — Configuración crítica

### Local (`nginx/nginx.local.conf`)

```nginx
server {
    listen 80;
    client_max_body_size 25M;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_connect_timeout 30s;
        proxy_send_timeout 660s;   # CRÍTICO: mayor que PRESENTON_TIMEOUT
        proxy_read_timeout 660s;   # CRÍTICO: mayor que PRESENTON_TIMEOUT
    }

    location /uploads/ {
        proxy_pass http://backend:8000;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

### Producción (`nginx/nginx.conf`)

SSL con Let's Encrypt, múltiples `server {}` por subdominio del VPS (`alexsters.works`). El bloque de XCalificator tiene los mismos timeouts 660s.

**Recarga en caliente (sin downtime):**
```bash
docker exec xcalificator_local_nginx sh -c "nginx -t && nginx -s reload"
# Producción:
docker exec xcalificator_nginx sh -c "nginx -t && nginx -s reload"
```

---

## 12. OCR y calificación automática

### Flujo OCR

```
Profesor sube foto del examen
    ↓
POST /grading/ocr  (multipart form)
    ↓
ocr_service.py → POST http://paddleocr:8001/ocr  (extrae texto)
    ↓
texto raw → Groq/Ollama (interpreta respuestas estudiante)
    ↓
compara con respuestas correctas del examen
    ↓
calificación + retroalimentación generada por IA
    ↓
guarda en notas tabla
```

### Actividades especiales (sopa de letras, crucigrama, emparejar)

Las actividades interactivas tienen su propia lógica de calificación visual:
- `vision_grading_service.py` — usa modelo de visión (Ollama Cloud o Groq Vision)
- `INTERACTIVE_TYPES = {"sopa_letras", "crucigrama", "emparejar"}` — cuando el tipo del examen está en este set, usa visión en lugar de OCR de texto

---

## 13. Lecciones aprendidas / Gotchas

### 1. nginx timeout (504) en generación de slides

**Síntoma:** `POST /api/presentaciones/clase` devuelve 504 después de exactamente 180 segundos.  
**Causa:** `proxy_read_timeout` por defecto en nginx es 180s. Presenton tarda ~220s.  
**Fix:** Cambiar a 660s en `nginx.local.conf` y `nginx.conf`. Recargar nginx.

### 2. PRESENTON_CUSTOM_LLM_API_KEY hardcodeada

**Riesgo:** Si esta key aparece en git history, invalida la key y expone el acceso.  
**Regla:** Siempre en `.env.local` (gitignored), nunca en `.env` committed.

### 3. Login frontend con localStorage — todos los campos obligatorios

El frontend verifica `access_token` + `refresh_token` + `user` (JSON con `{id, nombre, rol, ...}`).  
Si falta cualquiera, redirige a `/login`.

**Para tests/scripts (e.g., Playwright):**
```javascript
const res = await page.request.post(`${BASE}/api/auth/login`, {
  data: { correo: 'user@example.com', password: 'pass' }
});
const body = await res.json();
await page.evaluate(({ at, rt, user }) => {
  localStorage.setItem('access_token', at);
  localStorage.setItem('refresh_token', rt);
  localStorage.setItem('user', JSON.stringify(user));
}, { at: body.access_token, rt: body.refresh_token, user: body.user });
```

### 4. Frontend no tiene hot-reload en Docker

`frontend/Dockerfile` bake el build en la imagen. El contenedor sirve `/app/dist` estático.  
Cambios de código requieren: `build frontend && up -d --no-deps frontend`.

### 5. `libasound2t64` vs `libasound2`

En Ubuntu 24.04 (Jammy+) la librería se llama `libasound2t64`. En versiones anteriores es `libasound2`.  
Usar el nombre incorrecto hace que `apt-get install` falle o instale la versión incorrecta y Chrome no arranca.

### 6. Presenton genera ~220s con qwen3.7-plus vía OpenCode

El LLM `qwen3.7-plus` es el más confiable para la generación estructurada del outline.  
`meta-llama/llama-4-scout-17b-16e-instruct` es más rápido pero falla más con JSON Schema.  
El tiempo varía con la carga del gateway externo.

### 7. Scroll en modal — cuidado con `.overflow-y-auto`

En React, `document.querySelector('.overflow-y-auto')` puede matchear el `<main>` de la página (que también tiene esa clase) antes que el body del modal.  
Para hacer scroll programático al modal, filtrar:
```javascript
Array.from(document.querySelectorAll('.overflow-y-auto'))
  .find(e => e.tagName !== 'MAIN' && e.tagName !== 'TEXTAREA' && e.scrollHeight > e.clientHeight)
```

### 8. PostgreSQL init.sql solo corre una vez

El `init.sql` se monta en `/docker-entrypoint-initdb.d/init.sql` y solo se ejecuta cuando el **volumen pgdata está vacío**. Si el schema cambia después del primer arranque, se necesita:
```bash
docker-compose -f docker-compose.local.yml down -v  # DESTRUYE datos
docker-compose -f docker-compose.local.yml up -d
```
O hacer la migración manualmente con ALTER TABLE.

### 9. CORS — configurar correctamente

`main.py` lee `PUBLIC_DOMAIN` y `CORS_EXTRA_ORIGINS` del entorno para construir la lista de orígenes permitidos. En local, el origen es `http://localhost:8080`. En producción, `https://xcalificator.alexsters.works`.

### 10. Volumen `presenton_chrome` — Chrome pre-instalado

El volumen named `presenton_chrome` persiste el directorio `/root/.cache/puppeteer`. Esto evita que Chrome se descargue en cada arranque del contenedor. En primer arranque (volumen vacío), Docker copia el Chrome pre-instalado en la imagen al volumen. No borrar este volumen a menos que necesites actualizar Chrome.

---

## 14. Flujo completo: Profesor genera presentación

1. **Frontend** (`/profesor/presentacion`): profesor llena formulario (título, contenido, grado, n_slides, plantilla).
2. `POST /api/presentaciones/clase` con `Authorization: Bearer <token>`.
3. **Backend** router `presentaciones.py`:
   - Verifica que `herramientas/presentacion` está habilitada para la materia (feature flag).
   - Opcionalmente recupera contexto curricular DBA vía `curriculum_service.retrieve_curriculum_context()`.
   - Llama `presenton_service.generate_lesson_presentation()`.
4. **presenton_service**:
   - Construye prompt en español.
   - `POST http://presenton:80/api/v1/ppt/presentation/generate` (Basic Auth, timeout 600s).
   - Espera respuesta (~220s).
   - Descarga el PPTX resultante a `/uploads/presentations/<id>.pptx`.
5. **Backend** guarda la herramienta en DB (tabla `herramientas` con `tipo="presentacion"`).
6. **Backend** guarda métrica en `tiempos_evaluacion` (para tesis).
7. **Response 201** con `pptx_url` y `edit_url`.
8. **Frontend** muestra links: "Descargar PPTX" y "Editar en Presenton".
   - Descargar: `GET /uploads/presentations/<id>.pptx`
   - Editar: abre `http://localhost:5001/presentation?id=<presenton-id>` en nueva pestaña.

---

## 15. Flujo completo: Estudiante resuelve examen online

1. Estudiante entra a `/estudiante/examen/:id`.
2. **Frontend** carga `GET /examenes/:id` → obtiene `contenido_json` con preguntas.
3. `contenido_json` es un objeto JSON con campos opcionales según tipo de pregunta:
   ```json
   {
     "preguntas": [{id, enunciado, tipo, opciones, respuesta_correcta}],
     "sopa_letras": {palabras, cuadricula},
     "crucigrama": {pistas_h, pistas_v, cuadricula},
     "emparejar": {pares: [{id, izquierda, derecha}]}
   }
   ```
4. Cada tipo tiene su componente React (`Sopa.jsx`, `Crucigrama.jsx`, `Emparejar.jsx`).
5. Al finalizar: `POST /examenes/:id/respuestas` con `{respuestas: {...}}`.
6. **Backend** califica automáticamente si es tipo `online` con respuestas múltiple opción.
7. Para exámenes con visión (interactivos): pasa a calificación manual o via OCR.

---

## 16. Cómo reconstruir el sistema paso a paso

### Paso 1 — Infraestructura base

```bash
# Clonar repo
git clone <repo>
cd TESIS

# Crear archivos de entorno
cp .env.example .env
# Editar .env con valores reales

# Para Presenton (secreto):
echo "PRESENTON_CUSTOM_LLM_API_KEY=sk-xxx" > .env.local
```

### Paso 2 — Primer arranque local

```bash
docker-compose -f docker-compose.local.yml --profile presenton up -d
```

Esperar que todos los servicios estén `healthy`. PostgreSQL ejecuta `init.sql` automáticamente.

### Paso 3 — Verificar servicios

```bash
# Backend health
curl http://localhost:8080/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@xcalificator.com","password":"Admin123!"}'

# Presenton health
curl http://localhost:8080/api/presentaciones/health
# Espera: {"ok": true}

# Frontend
curl http://localhost:8080/  # debe devolver HTML
```

### Paso 4 — Reconstruir imagen Presenton (si es necesario)

```bash
docker-compose -f docker-compose.local.yml build presenton
docker-compose -f docker-compose.local.yml up -d --no-deps presenton
```

### Paso 5 — Deploy producción

```bash
# En el VPS
cd /opt/xcalificator
git pull
docker-compose --profile presenton build
docker-compose --profile presenton up -d
```

---

## 17. Dependencias Python (backend)

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.35
asyncpg==0.30.0
psycopg2-binary==2.9.9
alembic==1.13.0
pydantic[email]==2.9.0
pydantic-settings==2.5.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.2.0
python-multipart==0.0.12
httpx==0.27.0
redis==5.1.0
aiosmtplib==3.0.1
jinja2==3.1.4
python-dotenv==1.0.1
groq==0.11.0
reportlab==4.2.0
Pillow==10.4.0
opencv-python-headless==4.10.0.84
PyMuPDF==1.24.0
pdfplumber==0.11.0
numpy==1.26.4
google-auth==2.35.0
google-auth-oauthlib==1.2.1
google-auth-httplib2==0.2.0
google-api-python-client==2.149.0
```

## 18. Dependencias JavaScript (frontend)

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26.0",
  "axios": "^1.7.5",
  "zustand": "^4.5.5",
  "lucide-react": "^0.441.0",
  "tailwindcss": "^3.4.10",
  "react-hot-toast": "^2.4.1",
  "dompurify": "^3.3.3",
  "react-dropzone": "^14.2.3",
  "recharts": "^3.7.0",
  "@jaredreisinger/react-crossword": "^5.2.0",
  "gsap": "^3.15.0",
  "katex": "^0.16.28",
  "date-fns": "^3.6.0",
  "xlsx": "^0.18.5"
}
```

---

## 19. Mejoras pendientes conocidas

1. **Retry automático en Presenton** — cuando el LLM devuelve JSON inválido, reintentar automáticamente (máx 2 intentos) en `presenton_service._generate_with_prompt()`.

2. **UX spinner generación slides** — el frontend debe mostrar un mensaje claro de espera durante los ~7 minutos del proceso. Actualmente muestra spinner genérico sin tiempo estimado.

3. **Tipo "unir columnas" en OCR** — `INTERACTIVE_TYPES` no incluye `unir_columnas`. Se necesita:
   - Agregar a `INTERACTIVE_TYPES` en `grading.py` y `vision_grading_service.py`
   - Añadir handler de visión `_grade_unir_columnas_with_vision()`
   - Actualizar `examenes.py` con el bloque de grade
   - Actualizar `schemas.py` y `tool_flags.py`
   - Renderizar en `ResolverExamen.jsx` usando el componente `Emparejar` (mismo schema)

4. **XaliMaster markdown rendering** — las respuestas del asistente se muestran como texto plano. Necesita un mini-parser `**bold**` → `<strong>`, listas → `<li>`, sanitizado con DOMPurify (ya en dependencies).

5. **Rebuild Presenton en producción** — después de cualquier cambio en `presenton_patches/`, hacer `docker-compose build presenton && docker-compose up -d presenton` en el VPS.

6. **RAG curricular** — los documentos DBA se almacenan pero el índice de recuperación está en memoria y se pierde al reiniciar. Considerar persistir embeddings en PostgreSQL con `pgvector` o en un archivo.

---

## 20. Modelo de AI Provider

El sistema soporta múltiples proveedores IA por profesor:

```python
# profesor_ai_configs tabla
proveedor: "groq" | "ollama" | "opencode"
base_url: "https://api.groq.com/openai/v1"  # o la URL del proveedor
api_key: "<key del profesor>"
modelo: "llama-4-scout-17b-16e-instruct"
```

`ai_provider_config.py` provee:
- `get_profesor_ai_config(db, profesor_id)` — obtiene config del profesor (o global si no tiene)
- `fetch_groq_models()` / `fetch_open_code_models()` — lista modelos disponibles
- `upsert_profesor_ai_config()` — guarda/actualiza config

Presenton **usa su propio LLM separado** (variables `PRESENTON_CUSTOM_*`), no el del profesor. Esto es intencional para desacoplar la calidad de los slides del modelo que usa el profesor para calificar.

---

## 21. Xali Exam Designer — chat interactivo para crear exámenes

### Qué es

Página `/profesor/crear-examen-chat` — interfaz de chat donde el profesor diseña un examen paso a paso conversando con la IA. Soporta adjuntar imágenes y PDFs (páginas del libro, notas de clase, fotos de pizarrón) para que la IA extraiga el contenido temático y genere preguntas basadas en él.

**Punto de acceso:** Herramientas → Tab "Evaluaciones y Actividades" → card "Diseñar con chat IA".

### Flujo

1. El profesor abre el chat (desde Herramientas tab 1, o desde XaliMaster → "Diseñar con IA").
2. Describe el examen: tema, grado, número de preguntas, tipos.
3. Opcionalmente sube fotos o PDFs como contexto.
4. La IA propone 3–4 preguntas por turno, el profesor corrige o aprueba.
5. Cuando el profesor dice "listo" / "perfecto" / "guarda", la IA produce el JSON final en `<exam_draft>...</exam_draft>`.
6. El frontend muestra un panel verde "Examen listo — N preguntas" con botón "Guardar como borrador".
7. Al guardar: si viene de una materia (`?materia=<id>` en la URL) → crea Examen formal; si no → guarda como Herramienta borrador.

### Endpoint

```
POST /api/generate/exam-chat
Content-Type: multipart/form-data

Campos:
- message: str (texto del usuario)
- history: str (JSON array [{role, content}], últimos 8 turnos)
- materia_id: str (opcional, para contexto curricular)
- files: UploadFile[] (opcional, max 3 imágenes o PDFs)

Respuesta:
{
  "response": "texto del asistente (markdown)",
  "exam_draft": null | {
    "titulo": "...",
    "preguntas": [{numero, tipo, enunciado, opciones, respuesta_correcta, puntos}]
  }
}
```

### Modelo

`qwen3.7-plus` vía Open Code (mismo modelo configurado en el perfil del profesor para visión).

### Sistema de detección del borrador

La IA embebe el JSON en `<exam_draft>...</exam_draft>`. El backend lo extrae con regex, lo parsea, aplica `normalize_latex_payload` y `_ensure_question_media_fields`, y lo elimina del texto visible de la respuesta. El frontend solo muestra el texto limpio + el panel de previsualización.

### Gotcha: modelo debe soportar visión

Si el profesor adjunta imágenes, los mensajes se construyen como contenido multimodal (`content: [{type: "text"}, {type: "image_url"}]`). Si el modelo del profesor no es un modelo de visión, el endpoint fallará. El mensaje de error indica "configura Open Code". El modelo default `qwen3.7-plus` soporta visión.

---

## 22. Evaluación Rápida — digitalizar examen hecho a mano sin configuración previa

### Qué es

Página `/profesor/evaluacion-rapida` (frontend) + endpoint `POST /api/generate/evaluacion-rapida` (backend) — permite al profesor tomar 1–3 fotos de un examen que escribió a mano, extraer las preguntas automáticamente y opcionalmente guardarlas como examen formal.

**Punto de acceso:** Herramientas → Tab "Evaluaciones y Actividades" → card "Digitalización rápida".

### Caso de uso típico

El profesor escribió en el tablero: "1. ¿Cuánto es 4+4? 2. ¿Cuánto es 2×9?" sin tenerlo registrado en el sistema. Con este endpoint puede:
1. Tomar foto del tablero/hoja → el sistema extrae las preguntas
2. Si tiene `materia_id` → guarda como examen digitalizado en esa materia
3. Si no → devuelve el JSON extraído para que el profesor lo revise antes de guardar

Después puede usar el flujo normal de calificación por OCR para corregir las hojas de respuestas de los estudiantes.

### Endpoint

```
POST /api/generate/evaluacion-rapida
Content-Type: multipart/form-data

Campos:
- titulo: str (default "Evaluación rápida")
- materia_id: str (opcional)
- fotos: UploadFile[] (1–3 imágenes/PDFs)

Respuesta:
{
  "saved": true | false,
  "examen_id": "uuid" | null,
  "titulo": "...",
  "contenido_json": {...},
  "clave_respuestas": {...},
  "n_preguntas": 5
}
```

### Diferencia con `/exam/digitalize`

`/exam/digitalize` requiere `materia_id` obligatorio y siempre guarda. `/evaluacion-rapida` hace `materia_id` opcional: si no se pasa, solo devuelve el JSON extraído sin tocar la DB (útil para previsualizar antes de guardar).

### OCR / Vision

Usa el mismo pipeline de visión que el resto del sistema: `open_code_vision_json` con Qwen3.7 Plus. Requiere que el profesor tenga Open Code configurado en su perfil (Base URL + API Key).

---

## 23. Pipeline de calificación OCR — solo visión (sin PaddleOCR)

> **Nota de arquitectura**: PaddleOCR fue eliminado completamente. No existe el microservicio en ningún docker-compose. Todo el OCR se hace con modelos de visión via `direct_vision_extract_exam_answers()`.

### Flujo actualizado

```
Foto examen estudiante
        │
normalize_image_to_png()   ← solo normaliza: PNG, max 2048px
        │
base64.b64encode()
        │
open_code_vision_json()    ← Qwen3.7 Plus lee la imagen
        │
{"preguntas": [{numero, respuesta}]}   ← JSON directo
        │
grade_exam_with_fallback()  ← compara con clave_respuestas
        │
{nota, retroalimentacion}
```

### Función central

`direct_vision_extract_exam_answers(file_bytes, filename, preguntas, provider_config)` en `ocr_service.py`:
- Determina provider (open_code_vision / ollama_vision / groq_vision)
- Construye prompt con listado de preguntas del examen como contexto
- La IA devuelve `{"preguntas": [{"numero": N, "respuesta": "..."}]}` directamente
- Evalúa calidad: baja si <30% respondidas, media si <60%, alta si ≥60%
- Retorna mismo shape que el antiguo `process_exam_image` para compatibilidad

### Gotcha: `image_to_bytes` eliminada

`normalize_image_to_png()` retornaba `image_to_bytes(img)` (función que se eliminó junto con PaddleOCR). En la versión actualizada retorna `cv2.imencode(".png", img)[1].tobytes()` directamente. Si se ve un `NameError: image_to_bytes`, buscar en `ocr_service.py` y reemplazar la línea.

### Defaults en DB

`ai_global_config.ocr_provider DEFAULT 'open_code_vision'` — ya no es `paddleocr`. Si una instalación antigua tiene `paddleocr` como valor, el código lo ignora y usa `open_code_vision` como fallback.
