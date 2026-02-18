# XCALIFICATOR

> Plataforma educativa con inteligencia artificial para la generación automática de exámenes, calificación inteligente y seguimiento del desempeño académico, adaptada al sistema educativo colombiano.

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Características Principales](#características-principales)
3. [Arquitectura](#arquitectura)
4. [Stack Tecnológico](#stack-tecnológico)
5. [Prerrequisitos](#prerrequisitos)
6. [Instalación y Configuración](#instalación-y-configuración)
7. [Variables de Entorno](#variables-de-entorno)
8. [Servicios y Puertos](#servicios-y-puertos)
9. [Roles de Usuario](#roles-de-usuario)
10. [Escala de Calificación](#escala-de-calificación)
11. [Partes por Mejorar](#partes-por-mejorar)

---

## Descripción General

**Xcalificator** es una aplicación web full-stack diseñada para docentes y estudiantes de Colombia. Permite a los profesores generar exámenes personalizados usando modelos de lenguaje de gran escala (LLMs), calificar respuestas escritas o digitalizadas mediante OCR, y analizar el desempeño del curso. Los estudiantes pueden presentar exámenes en línea y consultar sus notas, mientras un asistente de IA llamado **Xali** responde preguntas sobre el contenido del examen.

---

## Características Principales

### Para Profesores
- **Generación de exámenes con IA**: Crea exámenes con preguntas de selección múltiple, verdadero/falso, preguntas abiertas, sopas de letras y crucigrams, especificando grado escolar colombiano (Preescolar → 11°), nivel de dificultad, tema y contenido base.
- **Vista previa de examen en PDF**: Modal de pantalla completa con/sin clave de respuestas, generado con colores institucionales (índigo y violeta).
- **Calificación inteligente**: Las preguntas objetivas (selección múltiple, V/F) se califican localmente de forma instantánea; las preguntas abiertas se envían al LLM para evaluación contextual.
- **Calificación por OCR**: Sube una foto del examen impreso → PaddleOCR extrae el texto → calificación automática.
- **Dashboard de métricas**: Distribución de notas por rangos colombianos, análisis de dificultad por pregunta, ranking de estudiantes.
- **Exámenes en línea**: Los estudiantes responden directamente en la plataforma; el profesor ve los resultados en tiempo real.

### Para Estudiantes
- **Presentación de exámenes en línea**: Interfaz limpia, cronometrada, con envío y calificación inmediata.
- **Historial de notas**: Visualización de todas las calificaciones obtenidas.
- **Xali – Asistente de IA**: Chatbot persistente que responde preguntas sobre el contenido del examen con memoria multi-turno.
- **Perfil editable**: Foto, nombre e información personal.

### Para Administradores
- **Dashboard de uso de API**: Monitoreo del consumo de tokens y llamadas a los modelos LLM.
- **Gestión de usuarios**.

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
| Caché / Sesiones | Redis | 7-alpine |
| Frontend | React | 18.3.1 |
| Frontend build | Vite | 5.4.21 |
| Estilos | Tailwind CSS | 3.x |
| Estado global | Zustand | 4.5.5 |
| Rutas | React Router DOM | 6.26 |
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
| `estudiante` | Presentar exámenes en línea, consultar notas, chatear con Xali, editar perfil |
| `profesor` | Todo lo anterior + generar/editar/eliminar exámenes, calificar (OCR y online), ver métricas, asignar exámenes |
| `admin` | Todo lo anterior + ver dashboard de uso de API, gestionar usuarios |

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

## Partes por Mejorar

A continuación se listan las áreas identificadas con oportunidades de mejora para versiones futuras del proyecto:

### Autenticación y Seguridad
- **Verificación de correo electrónico**: Actualmente no se valida el email al registrarse. Implementar un flujo de confirmación por correo antes de activar la cuenta.
- **OAuth de borde**: El flujo de Google OAuth puede fallar si el usuario no tiene foto de perfil o si revoca permisos. Mejorar el manejo de casos borde.
- **Cuotas por usuario**: El rate limiting usa Redis globalmente, pero no impone límites individuales de tokens LLM por profesor. Agregar cuotas configurables por cuenta.

### Frontend y Experiencia de Usuario
- **Build de producción del frontend**: Actualmente se ejecuta `vite --host` (modo desarrollo) dentro del contenedor. Debe reemplazarse por un `vite build` con Nginx sirviendo los archivos estáticos para producción.
- **Actualización en tiempo real**: Las nuevas entregas de exámenes requieren que el profesor recargue la página manualmente. Implementar WebSockets o Server-Sent Events (SSE) para notificaciones en tiempo real.
- **Soporte móvil / PWA**: La interfaz no está optimizada para pantallas pequeñas. Convertir la aplicación en una Progressive Web App (PWA) con diseño responsive completo.
- **Internacionalización (i18n)**: La plataforma está completamente en español. Agregar soporte multi-idioma (inglés al menos) usando `react-i18next`.

### Funcionalidades Académicas
- **Exportación de notas**: No existe opción de exportar las calificaciones del curso a CSV o Excel. Agregar botón de descarga en el panel de métricas del profesor.
- **Importación masiva de estudiantes**: Los profesores deben agregar estudiantes uno a uno. Permitir carga de listados en CSV/Excel.
- **Control de versiones de exámenes**: Al editar un examen ya publicado, se sobreescribe directamente. Implementar historial de versiones para preservar las calificaciones anteriores y auditabilidad.
- **Seguimiento de progreso del estudiante**: Las notas de cada estudiante se muestran por examen individual. Agregar una vista de evolución longitudinal (curva de progreso a lo largo del tiempo).
- **Sistema de notificaciones**: No hay alertas cuando el profesor publica un examen o cuando se carga la calificación. Implementar notificaciones in-app y/o por correo.

### Inteligencia Artificial y OCR
- **Pre-procesamiento de imágenes para OCR**: La precisión de PaddleOCR depende directamente de la calidad de la foto subida. Agregar un pipeline de pre-procesamiento (corrección de perspectiva, binarización, reducción de ruido) antes de enviar la imagen.
- **Detección de plagio**: Las respuestas abiertas de diferentes estudiantes no se comparan entre sí. Integrar una detección básica de similitud textual (por ejemplo, TF-IDF o embeddings) para alertar sobre respuestas idénticas o muy similares.
- **Contexto cross-examen en Xali**: El chatbot Xali solo tiene memoria del examen actual en la sesión. Extender su contexto para que pueda responder preguntas comparando resultados entre varios exámenes o temas del mismo estudiante.
- **Validación de grids OCR**: La generación de sopas de letras y crucigrams no pasa por un validador estricto. Algunos grids pueden ser incorrectos o quedar sin resolver. Agregar validación algorítmica de los puzzles generados.

### Infraestructura y DevOps
- **Variables de entorno de ejemplo**: Agregar un archivo `.env.example` con todas las variables necesarias documentadas para facilitar el onboarding.
- **Pruebas automatizadas**: No existe suite de tests. Implementar pruebas unitarias para servicios clave (groq_service, pdf_service, grading) y pruebas de integración para los endpoints principales.
- **CI/CD**: Configurar un pipeline de GitHub Actions para ejecutar linting, tests y build automático en cada pull request.
- **Backups de base de datos**: No hay política de respaldo automático del volumen PostgreSQL. Configurar backups programados (pg_dump) hacia almacenamiento externo (S3 u otro).
- **Logs centralizados**: Los logs de los 7 contenedores no están centralizados. Integrar un stack de observabilidad como Loki + Grafana o una solución equivalente.

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
