# XCALIFICATOR

> Plataforma educativa con inteligencia artificial para la generación automática de exámenes, calificación inteligente y seguimiento integral del desempeño académico, adaptada al sistema educativo colombiano.

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Características Principales](#características-principales)
3. [Arquitectura](#arquitectura)
4. [Stack Tecnológico](#stack-tecnológico)
5. [Estructura del Proyecto](#estructura-del-proyecto)
6. [Prerrequisitos](#prerrequisitos)
7. [Instalación y Configuración](#instalación-y-configuración)
8. [Variables de Entorno](#variables-de-entorno)
9. [Servicios y Puertos](#servicios-y-puertos)
10. [API Endpoints](#api-endpoints)
11. [Roles de Usuario](#roles-de-usuario)
12. [Escala de Calificación](#escala-de-calificación)
13. [Base de Datos](#base-de-datos)

---

## Descripción General

**Xcalificator** es una aplicación web full-stack diseñada para docentes y estudiantes de Colombia. Permite a los profesores generar exámenes personalizados usando modelos de lenguaje de gran escala (LLMs), calificar respuestas escritas o digitalizadas mediante OCR, gestionar períodos académicos, controlar asistencia, generar boletines y analizar el desempeño del curso. Los estudiantes pueden presentar exámenes en línea (individual o grupal), consultar sus notas y boletines, mientras un asistente de IA llamado **Xali** responde preguntas sobre el contenido del examen con sesiones controladas por tiempo y número de preguntas. Un panel administrativo permite gestionar usuarios, materias y auditar toda la actividad del sistema.

---

## Características Principales

### Para Profesores
- **Generación de exámenes con IA**: Crea exámenes con preguntas de selección múltiple, verdadero/falso, preguntas abiertas, sopas de letras y crucigramas, especificando grado escolar colombiano (Preescolar → 11°), nivel de dificultad, tema y contenido base.
- **Herramientas didácticas reutilizables**: Genera y almacena sopas de letras y crucigramas como herramientas independientes con seguimiento de estado (pendiente / asignado / completado), asignables a exámenes existentes.
- **Vista previa de examen en PDF**: Modal de pantalla completa con/sin clave de respuestas, generado con colores institucionales (índigo y violeta).
- **Calificación inteligente**: Las preguntas objetivas (selección múltiple, V/F) se califican localmente de forma instantánea; las preguntas abiertas se envían al LLM para evaluación contextual.
- **Calificación por OCR**: Sube una foto del examen impreso → PaddleOCR extrae el texto → calificación automática.
- **Modo grupal**: Los exámenes pueden habilitarse para resolución en grupo; los estudiantes crean equipos, invitan compañeros y envían respuestas conjuntas que se asignan a todos los miembros.
- **Períodos académicos**: Gestión de períodos con porcentajes configurables por tipo de actividad para cada materia.
- **Control de asistencia**: Registro diario de asistencia por materia con estados (presente, ausente, tarde, excusa), exportable a PDF.
- **Reportes y boletines**: Generación de boletines por período con cálculo automático de promedios ponderados, observaciones y exportación a PDF.
- **Dashboard de métricas**: Distribución de notas por rangos colombianos, análisis de dificultad por pregunta, ranking de estudiantes.

### Para Estudiantes
- **Presentación de exámenes en línea**: Interfaz limpia con soporte para fórmulas matemáticas (KaTeX), envío y calificación inmediata.
- **Modo grupal**: Crear o unirse a grupos para resolver exámenes grupales colaborativamente.
- **Historial de notas**: Visualización de todas las calificaciones obtenidas con actividad reciente.
- **Boletín académico**: Consulta del boletín por período con promedios ponderados y estados de desempeño.
- **Xali – Asistente de IA**: Chatbot con sesiones controladas (máx. 5 preguntas / 10 minutos por sesión) que responde preguntas sobre el contenido del examen con contexto RAG y soporte para fórmulas LaTeX.
- **Perfil editable**: Foto, nombre e información personal.

### Para Administradores
- **Dashboard de uso de API**: Monitoreo del consumo de tokens y llamadas a los modelos LLM.
- **Gestión de usuarios**: CRUD completo de usuarios con filtros por rol.
- **Gestión de materias**: Administración centralizada de materias.
- **Log de auditoría**: Registro detallado de todas las acciones del sistema con filtros y búsqueda.

---

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│                   Nginx :80                      │
│     Reverse proxy → /api → backend              │
│                   → /    → frontend             │
└──────────┬──────────────────────┬───────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │  Backend    │        │  Frontend   │
    │  FastAPI    │        │ React/Vite  │
    │  :8000      │        │  :3000      │
    └──────┬──────┘        └─────────────┘
           │
     ┌─────┼──────────────────────────┐
     │     │                          │
┌────▼───┐ ┌──────┐  ┌────────────┐  ┌──────────────┐
│Postgres│ │Redis │  │ PaddleOCR  │  │  Groq API    │
│  :5432 │ │:6379 │  │   :8001    │  │ (externo)    │
└────────┘ └──────┘  └────────────┘  └──────────────┘
```

### Flujo de Calificación Inteligente

```
Respuesta del estudiante
        │
        ▼
¿Tipo de pregunta?
  ├── selección_múltiple / verdadero_falso
  │       └──► Comparación local (instantánea, sin LLM)
  └── pregunta_abierta / desarrollo
          └──► LLM (llama-3.3-70b-versatile) → Nota 1.0–5.0
```

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | FastAPI | 0.115.0 |
| Backend | Python | 3.11 |
| ORM | SQLAlchemy (async) | 2.0.35 |
| Base de datos | PostgreSQL | 16-alpine |
| Caché / Rate Limiting | Redis | 7-alpine |
| Frontend | React | 18.3.1 |
| Frontend build | Vite | 5.4.21 |
| Estilos | Tailwind CSS | 3.4.10 |
| Estado global | Zustand | 4.5.5 |
| Rutas | React Router DOM | 6.26 |
| Íconos | Lucide React | — |
| Fórmulas matemáticas | KaTeX | 0.16.28 |
| PDF | ReportLab | 4.x |
| OCR | PaddleOCR | 2.x |
| LLM | Groq API | — |
| Modelo – generación | llama-4-maverick | — |
| Modelo – calificación | llama-3.3-70b-versatile | — |
| Modelo – chat (Xali) | llama-4-scout | — |
| Modelo – clasificación | llama-3.1-8b-instant | — |
| Auth | JWT + Google OAuth 2.0 | — |
| Infraestructura | Docker Compose | — |
| Proxy inverso | Nginx | alpine |

---

## Estructura del Proyecto

```
XCALIFICATOR/
├── docker-compose.yml
├── .env                        # Variables de entorno (no versionado)
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── db/
│   │   └── init.sql            # Schema PostgreSQL inicial
│   ├── uploads/                # Archivos subidos (imágenes OCR)
│   └── app/
│       ├── main.py             # Punto de entrada FastAPI
│       ├── core/
│       │   ├── config.py       # Settings (Pydantic)
│       │   ├── database.py     # Motor async SQLAlchemy
│       │   ├── dependencies.py # Auth guards (get_current_user, require_role)
│       │   ├── rate_limiter.py # Rate limiting con Redis
│       │   ├── redis.py        # Cliente Redis
│       │   └── security.py     # JWT, hashing, OAuth
│       ├── models/
│       │   └── models.py       # 17 modelos SQLAlchemy
│       ├── schemas/
│       │   └── schemas.py      # Schemas Pydantic v2
│       ├── routers/
│       │   ├── auth.py         # Login, registro, OAuth, perfil
│       │   ├── admin.py        # Dashboard admin, auditoría
│       │   ├── materias.py     # CRUD materias, matrículas
│       │   ├── examenes.py     # CRUD exámenes, publicación
│       │   ├── generation.py   # Generación IA de exámenes
│       │   ├── grading.py      # Calificación (local + LLM + OCR)
│       │   ├── chat.py         # Chatbot Xali con sesiones
│       │   ├── notifications.py# Notificaciones email/WhatsApp
│       │   ├── periodos.py     # Períodos académicos
│       │   ├── herramientas.py # Sopas/crucigramas independientes
│       │   ├── asistencia.py   # Control de asistencia
│       │   ├── reportes.py     # Boletines y reportes
│       │   └── grupos.py       # Modo grupal
│       └── services/
│           ├── groq_service.py # Cliente Groq (generación, calificación, RAG)
│           ├── notification_service.py # Email SMTP + WhatsApp Whapi
│           ├── ocr_service.py  # Cliente HTTP hacia PaddleOCR
│           └── pdf_service.py  # Generación PDF con ReportLab
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx            # Punto de entrada React
│       ├── App.jsx             # Rutas y layout
│       ├── api.js              # Cliente Axios + interceptors
│       ├── store.js            # Zustand store (auth, state)
│       ├── components/
│       │   ├── Layout.jsx      # Sidebar + navbar
│       │   ├── MathText.jsx    # Renderizador KaTeX (LaTeX)
│       │   ├── Crucigrama.jsx  # Componente crucigrama interactivo
│       │   ├── SopaLetras.jsx  # Componente sopa de letras interactiva
│       │   ├── ConfirmDialog.jsx
│       │   ├── EmptyState.jsx
│       │   ├── StatCard.jsx
│       │   ├── Breadcrumb.jsx
│       │   └── SkeletonLoader.jsx
│       └── pages/
│           ├── Login.jsx
│           ├── Register.jsx
│           ├── Perfil.jsx
│           ├── admin/
│           │   ├── Dashboard.jsx         # Métricas API, auditoría
│           │   ├── Users.jsx             # Gestión usuarios
│           │   ├── Materias.jsx          # Gestión materias
│           │   ├── AuditLog.jsx          # Log auditoría
│           │   └── Periodos.jsx          # Períodos académicos
│           ├── profesor/
│           │   ├── Materias.jsx          # Lista materias
│           │   ├── MateriaDetail.jsx     # Detalle con tabs
│           │   ├── MateriaEstudiantes.jsx
│           │   ├── MateriaCalificaciones.jsx
│           │   ├── MateriaAsistencia.jsx # Control asistencia
│           │   ├── MateriaReportes.jsx   # Boletines/reportes
│           │   ├── Examenes.jsx          # Grid de exámenes
│           │   ├── GenerarExamen.jsx
│           │   ├── GenerarCrucigrama.jsx
│           │   ├── GenerarSopaLetras.jsx
│           │   ├── Herramientas.jsx      # Gestor herramientas
│           │   ├── Calificar.jsx
│           │   └── Notas.jsx
│           └── estudiante/
│               ├── Home.jsx              # Dashboard personalizado
│               ├── ResolverExamen.jsx    # Resolver + modo grupal
│               ├── Chat.jsx             # Xali con sesiones
│               ├── Notas.jsx
│               └── Boletin.jsx          # Boletín académico
├── paddleocr/
│   ├── Dockerfile
│   ├── main.py                 # Servicio FastAPI OCR
│   └── requirements.txt
└── nginx/
    └── nginx.conf              # Reverse proxy config
```

---

## Prerrequisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x con Docker Compose v2
- Cuenta y API Key en [Groq](https://console.groq.com/)
- Credenciales de Google OAuth (para login social, opcional)
- Git

---

## Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/Andres-back/XCALIFICATOR.git
cd XCALIFICATOR
```

### 2. Crear el archivo de entorno

Copia el archivo de ejemplo y completa los valores:

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales (ver sección [Variables de Entorno](#variables-de-entorno)).

### 3. Levantar los servicios

```bash
docker compose up --build -d
```

La primera ejecución descarga imágenes base y construye las imágenes del backend, frontend y PaddleOCR. Puede tomar varios minutos.

### 4. Verificar que todo esté en pie

```bash
docker compose ps
```

Todos los servicios deben aparecer en estado `running` o `healthy`.

### 5. Acceder a la aplicación

| URL | Descripción |
|-----|-------------|
| `http://localhost` | Aplicación principal (vía Nginx) |
| `http://localhost:3000` | Frontend directo |
| `http://localhost:8000/docs` | Swagger UI del backend |
| `http://localhost:8001` | Servicio PaddleOCR |

### 6. (Opcional) Iniciar con pgAdmin

```bash
docker compose --profile dev up -d
# pgAdmin disponible en http://localhost:5050
# Email: admin@xcalificator.com  |  Password: admin123
```

### Detener los servicios

```bash
docker compose down
# Para también eliminar volúmenes (borra la base de datos):
docker compose down -v
```

---

## Variables de Entorno

```dotenv
# ─── Base de datos ────────────────────────────────────────────
POSTGRES_USER=xcalificator
POSTGRES_PASSWORD=tu_password_seguro
POSTGRES_DB=xcalificator_db
DATABASE_URL=postgresql+asyncpg://xcalificator:tu_password_seguro@postgres:5432/xcalificator_db

# ─── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─── JWT ──────────────────────────────────────────────────────
SECRET_KEY=genera_una_clave_aleatoria_de_32_caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# ─── Groq (LLM) ───────────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx

# ─── Google OAuth (opcional) ──────────────────────────────────
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost/api/auth/google/callback

# ─── Frontend ─────────────────────────────────────────────────
VITE_API_URL=http://localhost/api
```

---

## Servicios y Puertos

| Contenedor | Imagen / Build | Puerto externo | Puerto interno |
|-----------|---------------|---------------|---------------|
| `xcalificator_postgres` | `postgres:16-alpine` | — | 5432 |
| `xcalificator_redis` | `redis:7-alpine` | — | 6379 |
| `xcalificator_backend` | `./backend` | 8000 | 8000 |
| `xcalificator_frontend` | `./frontend` | 3000 | 3000 |
| `xcalificator_paddleocr` | `./paddleocr` | 8001 | 8001 |
| `xcalificator_nginx` | `nginx:alpine` | **80** | 80 |
| `xcalificator_pgadmin` | `dpage/pgadmin4` | 5050 (perfil `dev`) | 80 |

---

## Roles de Usuario

| Rol | Capacidades |
|-----|-------------|
| `estudiante` | Presentar exámenes (individual y grupal), consultar notas, ver boletines, chatear con Xali, editar perfil |
| `profesor` | Todo lo anterior + generar exámenes con IA, calificar (OCR y online), crear herramientas, gestionar asistencia, generar boletines, ver métricas |
| `admin` | Todo lo anterior + dashboard de API, gestionar usuarios/materias, log de auditoría, períodos académicos |

---

## Escala de Calificación

Xcalificator utiliza la **escala colombiana de 1.0 a 5.0**:

| Rango | Descripción |
|-------|-------------|
| 4.6 – 5.0 | Desempeño Superior |
| 4.0 – 4.5 | Desempeño Alto |
| 3.5 – 3.9 | Desempeño Básico alto |
| 3.0 – 3.4 | Desempeño Básico |
| 2.0 – 2.9 | Desempeño Bajo |
| 1.0 – 1.9 | Desempeño Muy Bajo |

> **Nota mínima aprobatoria: 3.0**

Los exámenes generados distribuyen los puntos para que la calificación máxima sea **5.0**.

---

## API Endpoints

El backend expone 13 routers bajo el prefijo `/api`. Documentación interactiva disponible en `/docs` (Swagger UI).

| Router | Prefijo | Descripción |
|--------|---------|-------------|
| `auth` | `/api/auth` | Login, registro, Google OAuth, refresh token, perfil, foto |
| `admin` | `/api/admin` | Dashboard uso API, CRUD usuarios, log auditoría |
| `materias` | `/api/materias` | CRUD materias, matrículas, filtros por rol |
| `examenes` | `/api/examenes` | CRUD exámenes, publicación, tipos de pregunta |
| `generation` | `/api/generate` | Generación IA (exámenes, sopas, crucigramas) |
| `grading` | `/api/grading` | Calificación online, OCR, retroalimentación LLM |
| `chat` | `/api/chat` | Xali chatbot con sesiones (5 preguntas / 10 min) |
| `notifications` | `/api/notifications` | Preferencias, envío email SMTP + WhatsApp |
| `periodos` | `/api/periodos` | CRUD períodos académicos |
| `herramientas` | `/api/herramientas` | Sopas/crucigramas reutilizables, asignar a exámenes |
| `asistencia` | `/api/asistencia` | Registro asistencia, consulta, exportación PDF |
| `reportes` | `/api/reportes` | Config porcentajes, cálculo promedios, boletines PDF |
| `grupos` | `/api/grupos` | Crear grupos, invitar miembros, envío grupal |

---

## Base de Datos

PostgreSQL 16 con 17 tablas:

| Tabla | Descripción |
|-------|-------------|
| `users` | Usuarios (estudiantes, profesores, admins) con foto y documento |
| `materias` | Materias académicas vinculadas a un profesor |
| `matriculas` | Relación estudiante ↔ materia |
| `examenes` | Exámenes con preguntas JSON, tipo, grado, modo grupal |
| `notas` | Calificaciones con detalle JSON, retroalimentación, imagen OCR |
| `chat_history` | Historial de mensajes del chatbot Xali |
| `chat_sessions` | Sesiones de chat con límites (preguntas usadas, tiempo) |
| `notificaciones` | Notificaciones in-app con tipo y estado leído |
| `preferencias_notif` | Preferencias de notificación por usuario (email/WhatsApp) |
| `audit_log` | Log de auditoría de acciones del sistema |
| `periodos_academicos` | Períodos con fechas inicio/fin y estado activo |
| `config_porcentajes` | Porcentajes por tipo de actividad por materia y período |
| `boletines` | Boletines generados con promedio, observaciones, PDF |
| `herramientas` | Herramientas didácticas (sopas/crucigramas) con estado |
| `asistencia` | Registros de asistencia diaria por estudiante y materia |
| `grupos_actividad` | Grupos para exámenes grupales con creador |
| `miembros_grupo` | Miembros de cada grupo con estado de aceptación |

---

## Contribuciones

Las contribuciones son bienvenidas. Para cambios importantes, por favor abre un issue primero para discutir lo que te gustaría cambiar.

```bash
# Flujo de trabajo sugerido
git checkout -b feature/nombre-de-la-feature
git commit -m "feat: descripción del cambio"
git push origin feature/nombre-de-la-feature
# Abre un Pull Request en GitHub
```

---

## Licencia

Este proyecto fue desarrollado como proyecto de tesis. Todos los derechos reservados © 2025.
