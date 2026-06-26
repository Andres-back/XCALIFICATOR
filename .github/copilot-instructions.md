# xCalificator — Instrucciones de Workspace para Copilot / Cursor

> Plataforma educativa colombiana para gestión de materias, exámenes, calificaciones, asistencia y boletines con IA (Groq LLM). Proyecto universitario (TESIS). Rama activa: `v1.3`.

---

## 1. Stack tecnológico

### Backend
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | FastAPI | 0.115.0 |
| ASGI | Uvicorn[standard] | 0.30.0 |
| ORM | SQLAlchemy (async) | 2.0.35 |
| DB Driver | asyncpg | 0.30.0 |
| Validación | Pydantic v2 | 2.9.0 |
| Auth | python-jose[cryptography] + passlib[bcrypt] | 3.3.0 / 1.7.4 |
| LLM | Groq SDK | 0.11.0 |
| Cache / Rate limiting | Redis | 5.1.0 |
| PDF | ReportLab | 4.2.0 |
| OCR (visión) | Modelos de visión vía Ollama / Groq / OpenCode (sin microservicio externo) | — |
| HTTP async | httpx | 0.27.0 |
| Email | aiosmtplib | 3.0.1 |
| Notif WhatsApp | Whapi (API REST externa) | — |
| Imágenes IA | Pollinations.ai (gen.pollinations.ai) | — |

### Frontend
| Capa | Tecnología | Versión |
|------|-----------|---------|
| UI | React | 18.3.1 |
| Build | Vite | 5.4.2 |
| Router | React Router DOM | 6.26.0 |
| Estilos | Tailwind CSS | 3.4.10 |
| Estado global | Zustand | 4.5.5 |
| HTTP | Axios | 1.7.5 |
| LaTeX | KaTeX | 0.16.28 |
| Iconos | Lucide React | 0.441.0 |
| Toasts | React Hot Toast | 2.4.1 |
| Upload | React Dropzone | 14.2.3 |
| Gráficos | Recharts | 3.7.0 |
| Fechas | date-fns | 3.6.0 |
| Crucigrama | react-crossword | 5.2.0 |

### Infraestructura (Docker — `docker-compose.yml`)
| Contenedor | Imagen | Puerto expuesto |
|-----------|-------|---------------|
| `xcalificator_postgres` | postgres:16-alpine | 5432 |
| `xcalificator_redis` | redis:7-alpine | 6379 |
| `xcalificator_backend` | Build local (`backend/`) | 8000 (interno) |
| `xcalificator_frontend` | Build local (`frontend/`) | 3000 (interno) |
| `xcalificator_nginx` | nginx:alpine | **80** (público) |
| `xcalificator_presenton` | Build local (`presenton_patches/`) | 5001 (interno) |

**Deploy**: `docker compose up -d --build backend frontend`
**DB**: `xcalificator_db`, user `xcalificator`, password en `.env`
**Proxy**: Nginx reenvía `/api/*` → `http://backend:8000` y sirve el frontend estático.

---

## 2. Variables de entorno (`.env`)

```
POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / DATABASE_URL
REDIS_URL=redis://redis:6379
GROQ_API_KEY=gsk_...
JWT_SECRET / JWT_EXPIRY=3600
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
WHAPI_API_URL / WHAPI_TOKEN
VITE_GOOGLE_CLIENT_ID
```

---

## 3. Estructura del proyecto

```
backend/
  app/
    main.py              ← App FastAPI, monta todos los routers en /api
    core/
      config.py          ← Settings (pydantic-settings, get_settings())
      database.py        ← async engine, AsyncSessionLocal, get_db()
      dependencies.py    ← get_current_user(), require_role(*roles)
      security.py        ← create_access_token(), create_refresh_token(), verify_token()
      rate_limiter.py    ← Redis-backed rate limiting middleware
      redis.py           ← get_redis() dependency
    models/
      models.py          ← TODOS los modelos SQLAlchemy (ver sección 4)
    schemas/
      schemas.py         ← TODOS los schemas Pydantic (request/response)
    routers/
      auth.py            ← /api/auth
      materias.py        ← /api/materias
      examenes.py        ← /api/examenes
      generation.py      ← /api/generate
      grading.py         ← /api/grading
      chat.py            ← /api/chat
      admin.py           ← /api/admin
      herramientas.py    ← /api/herramientas
      periodos.py        ← /api/periodos
      asistencia.py      ← /api/asistencia
      grupos.py          ← /api/grupos
      reportes.py        ← /api/reportes
      notifications.py   ← /api/notifications
    services/
      groq_service.py    ← Funciones LLM (generate_exam, generate_sopa_letras, etc.)
      ocr_service.py     ← Extracción por visión (Ollama/Groq/OpenCode)
      pdf_service.py     ← Genera PDFs con ReportLab
      notification_service.py ← Email + WhatsApp
  db/
    init.sql             ← Esquema SQL inicial (todas las tablas, índices, usuario admin)
  uploads/
    exposiciones/        ← Archivos subidos por estudiantes (exposiciones)

frontend/
  src/
    api.js               ← Axios instance con interceptors (bearer token, refresh 401)
    store.js             ← Zustand store: { user, isAuthenticated, login, logout, ... }
    App.jsx              ← Rutas con ProtectedRoute
    components/          ← Componentes reutilizables (ver sección 7)
    pages/
      admin/             ← Dashboard, Users, Materias, Periodos, Boletines, AuditLog
      profesor/          ← Materias, MateriaDetail, Examenes, Calificar, Notas,
                            Herramientas, Reportes, MateriaBoletines, MateriaReportes
      estudiante/        ← Home, Notas, ResolverExamen, Boletin, Chat

nginx/
  nginx.conf             ← Proxy: /api → backend:8000, / → frontend:3000
presenton_patches/       ← Parches del servicio Presenton (generación de presentaciones)
```

---

## 4. Modelos de base de datos (`models/models.py`)

Todos los IDs son UUID generado en Python (`default=uuid.uuid4`). Timestamps con timezone (`TIMESTAMPTZ`).

| Modelo | Tabla | Campos clave |
|--------|-------|-------------|
| `User` | `users` | id, nombre, apellido, documento (UNIQUE), correo (UNIQUE), celular, password_hash, google_id, rol (admin/profesor/estudiante), grado, activo, correo_verificado |
| `Sesion` | `sesiones` | id, user_id→User, ip, dispositivo, fecha_inicio, fecha_fin |
| `Materia` | `materias` | id, nombre, codigo (UNIQUE), profesor_id→User |
| `Matricula` | `matriculas` | id, estudiante_id→User, materia_id→Materia; UNIQUE(estudiante_id, materia_id) |
| `Examen` | `examenes` | id, materia_id→Materia, titulo, tipo (String 50), contenido_json (JSONB), clave_respuestas (JSONB), activo_online, fecha_limite, fecha_activacion, modo_grupal, max_integrantes |
| `Nota` | `notas` | id, estudiante_id→User, examen_id→Examen, nota (DECIMAL 4,2), detalle_json (JSONB), retroalimentacion, imagen_procesada_url, texto_extraido |
| `RespuestaOnline` | `respuestas_online` | id, estudiante_id→User, examen_id→Examen, respuestas_json (JSONB), enviado_at; UNIQUE(estudiante_id, examen_id) |
| `ChatHistory` | `chat_history` | id, nota_id→Nota, user_id→User, role (user/assistant), content |
| `ChatSession` | `chat_sessions` | id, estudiante_id→User, nota_id→Nota, cerrada, preguntas_usadas, inicio |
| `PeriodoAcademico` | `periodos_academicos` | id, nombre, numero (UNIQUE 1–4), fecha_inicio (DATE), fecha_fin (DATE), porcentaje (DECIMAL 5,2), activo |
| `ConfigPorcentaje` | `config_porcentajes` | id, materia_id→Materia, periodo_id→PeriodoAcademico, examen_id→Examen (nullable), tipo_actividad (nullable: "asistencia"/"participacion"), porcentaje; índices parciales únicos |
| `Boletin` | `boletines` | id, estudiante_id→User, materia_id→Materia, periodo_id→PeriodoAcademico, nota_final (DECIMAL 4,2), desglose_json (JSONB), publicado, publicado_at, created_by→User; UNIQUE(estudiante_id, materia_id, periodo_id) |
| `NotaParticipacion` | `notas_participacion` | id, materia_id, periodo_id, estudiante_id, nota (DECIMAL 4,2 default 0), observacion; UNIQUE(materia_id, periodo_id, estudiante_id) |
| `Asistencia` | `asistencias` | id, materia_id, estudiante_id, fecha (DATE), estado (presente/ausente/tardanza/justificado), observacion; UNIQUE(materia_id, estudiante_id, fecha) |
| `Herramienta` | `herramientas` | id, profesor_id→User, tipo (examen/crucigrama/sopa_letras/emparejar/cuento/para_colorear), titulo, contenido_json, clave_respuestas, config_json, estado (borrador/listo/asignado), materia_id, examen_id |
| `GrupoActividad` | `grupos_actividad` | id, examen_id→Examen, nombre, creador_id→User |
| `MiembroGrupo` | `miembros_grupo` | id, grupo_id→GrupoActividad, estudiante_id→User, es_lider, aceptado; UNIQUE(grupo_id, estudiante_id) |
| `APIUsageLog` | `api_usage_logs` | id, model, task, prompt_tokens, completion_tokens, total_tokens |
| `AuditLog` | `audit_logs` | id, user_id→User (nullable), accion, detalle (JSONB), ip |
| `PreferenciaNotif` | `preferencias_notif` | id, user_id (UNIQUE), acepta_email, acepta_whatsapp |
| `Notificacion` | `notificaciones` | id, user_id, tipo, canal (email/whatsapp), mensaje, enviado, fecha_envio |

---

## 5. API — Routers y endpoints principales

### Auth (`/api/auth`)
- `POST /register` — Registro con email de confirmación
- `GET /confirm-email?token=` — Verificar email
- `POST /login` — Login local → `{ access_token, refresh_token }`
- `POST /google` — OAuth Google → mismo response
- `POST /refresh` — Renovar access token
- `GET /me` — Perfil actual
- `PATCH /me` — Actualizar nombre/apellido/celular
- `POST /me/password` — Cambiar contraseña

### Materias (`/api/materias`)
- `POST /` — Crear (profesor/admin)
- `GET /mis-materias` — Del profesor actual
- `GET /{id}/estudiantes` — Lista de inscritos (profesor/admin propietario)
- `POST /inscribir` — Inscribirse por código (estudiante)
- `GET /mis-inscripciones` — Materias inscritas (estudiante)

### Exámenes (`/api/examenes`)
- `POST /` — Crear examen
- `GET /materia/{id}` — Exámenes de una materia (profesor/admin)
- `GET /{id}` — Ver examen (sin clave para estudiantes)
- `PATCH /{id}` — Editar título, preguntas, fechas
- `POST /responder/{id}` — Enviar respuestas online (estudiante)
- `GET /mis-notas` — Notas del estudiante actual
- `POST /notas` — Guardar nota (profesor/admin)
- `PATCH /notas/{nota_id}` — Editar nota + retroalimentación
- `DELETE /notas/{nota_id}` — Eliminar nota

### Generación (`/api/generate`)
Todos requieren rol profesor/admin. Rate limit: 10 req/min.
- `POST /exam` — Examen IA (Groq)
- `POST /sopa-letras` — Sopa de letras IA
- `POST /crucigrama` — Crucigrama IA
- `POST /emparejar` — Actividad de emparejar IA
- `POST /cuento` — Cuento educativo + imagen (Pollinations)
- `POST /para-colorear` — Página para colorear + imagen B&W

### Calificación (`/api/grading`)
Rate limit: 15 req/min.
- `POST /upload` — Subir imagen/PDF de examen → OCR → auto-calificación → guarda Nota
- `POST /grade-online/{examen_id}/{estudiante_id}` — Calificar respuesta online con IA

### Chat (`/api/chat`)
Rate limit: 30 req/min. Solo estudiantes.
- `POST /` — Mensaje al tutor Xali (RAG contextualizado con la nota)
- `GET /{nota_id}/history` — Historial
- `GET /session/{nota_id}` — Estado de sesión (preguntas_usadas, cerrada)

### Reportes (`/api/reportes`)
- `GET /config/{materia_id}/{periodo_id}` — Config de porcentajes por actividad
- `POST /config/{materia_id}` — Guardar config (debe sumar 100%)
- `GET /actividades/{materia_id}/{periodo_id}` — Exámenes en el rango del período
- `GET /materia/{materia_id}/periodo/{periodo_id}` — Reporte completo de notas
- `POST /boletin/{materia_id}/{periodo_id}` — Generar/publicar boletines
- `GET /boletines/materia/{materia_id}/{periodo_id}` — Boletines por materia
- `GET /mis-boletines` — Boletines del estudiante actual
- `GET /participacion/{materia_id}/{periodo_id}` — Notas de participación
- `POST /participacion/{materia_id}/{periodo_id}` — Guardar notas de participación (batch)

### Admin (`/api/admin`)
Solo rol admin:
- `GET /stats` — KPIs globales
- CRUD `/users` — Crear, listar, toggle activo, cambiar rol/grado, reset password, eliminar
- `GET /audit-log` — Últimas 200 acciones
- `GET /api-usage` — Consumo Groq
- `GET /boletines-global/{periodo_id}` — Boletines de todos los estudiantes por grado

### Asistencia (`/api/asistencia`)
- `POST /materia/{id}` — Registrar asistencia (upsert por fecha)
- `GET /materia/{id}` — Historial filtrado por fecha
- `GET /materia/{id}/export-pdf` — Exportar PDF de asistencia

### Herramientas (`/api/herramientas`)
- `GET /` / `POST /` — Listar y crear
- `POST /generate` — Generar con IA directamente (sin asignar)
- `POST /{id}/asignar` — Asignar herramienta a una materia (crea Examen)

### Períodos (`/api/periodos`)
- `GET /` — Todos los períodos (cualquier usuario autenticado)
- `POST /bulk` — Guardar/actualizar múltiples períodos (admin)

---

## 6. Lógica de negocio clave

### Cálculo de nota final por período
```
nota_final = Σ(nota_actividad × porcentaje/100)  capada a 5.0
```
- Si el estudiante no entregó → nota = 0.0 (nunca se salta)
- Tipos especiales en ConfigPorcentaje:
  - `tipo_actividad = "asistencia"` → nota = max(0, 5.0 - ausencias × 0.3)
  - `tipo_actividad = "participacion"` → nota de NotaParticipacion
- Los porcentajes de todas las actividades configuradas deben sumar exactamente 100%
- Implementado en `_calculate_weighted_grade(all_items, config_map)` en `reportes.py`

### Escala de calificación colombiana
- Rango: 1.0 – 5.0 (DECIMAL 4,2)
- Aprobado: ≥ 3.0
- Color display: ≥4.0 verde, ≥3.0 azul, <3.0 rojo

### Auto-calificación IA
- **Online**: Respuestas enviadas por estudiante → Groq compara con clave_respuestas → devuelve nota + feedback por pregunta
- **OCR**: Imagen/PDF → modelo de visión extrae respuestas directamente (Ollama/Groq/OpenCode) → calificación automática
- Resultado se guarda en `Nota.detalle_json` (array de preguntas con puntos obtenidos y feedback)

### Sesiones de chat (tutor Xali)
- Máximo 5 preguntas por sesión, 60 min de duración
- Contexto RAG: carga nota, detalle_json y retroalimentación del examen
- Modelo: `meta-llama/llama-4-scout-17b-16e-instruct`

### Seguridad JWT
- Access token: 1 hora, `{ sub: user_id, rol, type: "access" }`
- Refresh token: 7 días
- Frontend: interceptor axios reintenta con refresh si recibe 401

---

## 7. Frontend — Componentes clave

### Componentes reutilizables (`src/components/`)
| Componente | Uso |
|-----------|-----|
| `Layout.jsx` | Sidebar fijo (lg) / hamburger (móvil). Nav por rol. |
| `StatCard.jsx` | Tarjeta KPI con icono, valor, tendencia y color |
| `ConfirmDialog.jsx` | Modal de confirmación (danger/warning/primary) |
| `EmptyState.jsx` | Estado vacío con icono Lucide, título y acción |
| `SkeletonLoader.jsx` | Placeholder animado (card/list/stats/table) |
| `MathText.jsx` | Renderiza LaTeX inline `$...$` y display `$$...$$` via KaTeX |
| `Crucigrama.jsx` | Crucigrama interactivo (editable/readonly, navegación H↔V) |
| `SopaLetras.jsx` | Sopa de letras con drag-to-select y palabras encontradas en verde |
| `Emparejar.jsx` | Actividad de matching con líneas SVG de colores |
| `Cuento.jsx` | Historia educativa con imagen color/colorear y botón de imprimir |
| `ParaColorear.jsx` | Imagen para colorear con descarga y print |

### Clases CSS personalizadas
```css
.btn-primary    /* Botón azul primario */
.btn-secondary  /* Botón gris */
.btn-danger     /* Botón rojo */
.btn-success    /* Botón verde */
.input-field    /* Input con focus ring primary-500 */
.card           /* Contenedor blanco, redondeado, sombra */
```
Colores primarios: esquema **Indigo** (primary-50 a primary-900).  
Tipografía: **Poppins** (Google Fonts, cargado en index.html).

### Rutas (`App.jsx`)

| Path | Componente | Rol |
|------|-----------|-----|
| `/login` | Login | Público |
| `/register` | Register | Público |
| `/admin` | AdminDashboard | admin |
| `/admin/users` | AdminUsers | admin |
| `/admin/materias` | AdminMaterias | admin |
| `/admin/periodos` | AdminPeriodos | admin |
| `/admin/boletines` | AdminBoletines | admin |
| `/admin/audit` | AuditLog | admin |
| `/profesor/materias` | ProfesorMaterias | profesor |
| `/profesor/materia/:id` | MateriaDetail | profesor |
| `/profesor/calificar/:examenId` | Calificar | profesor |
| `/profesor/notas/:examenId` | ProfesorNotas | profesor |
| `/profesor/herramientas` | ProfesorHerramientas | profesor |
| `/profesor/reportes` | ProfesorReportes | profesor |
| `/estudiante` | EstudianteHome | estudiante |
| `/estudiante/notas` | EstudianteNotas | estudiante |
| `/estudiante/examen/:id` | ResolverExamen | estudiante |
| `/estudiante/boletin` | EstudianteBoletin | estudiante |
| `/estudiante/chat/:notaId` | EstudianteChat | estudiante |
| `/perfil` | Perfil | todos |

**MateriaDetail** es un dashboard con 6 tabs usando hash URL:
- `#examenes` → Exámenes (crear, editar, toggle online, PDF, clave)
- `#estudiantes` → Inscritos con asistencia
- `#calificaciones` → Editar notas
- `#reportes` → MateriaReportes (porcentajes, tabla de notas)
- `#boletines` → MateriaBoletines (imprimir boletines)
- `#asistencia` → Pasar lista por fecha

### Estado global (`store.js` — Zustand)
```js
{ user, isAuthenticated, loading }
// Acciones: login(), register(), googleLogin(), logout(), updateUser()
// Persiste en localStorage: access_token, refresh_token, user (JSON)
```

### Cliente HTTP (`api.js`)
```js
baseURL = '' // Vite proxy /api → http://backend:8000
// Request interceptor: agrega Authorization: Bearer {access_token}
// Response interceptor: si 401 → intenta refresh → reintenta → o redirige a /login
```

---

## 8. Servicios Groq (modelos LLM)

| Función | Modelo | Descripción |
|---------|--------|-------------|
| `generate_exam` | llama-4-maverick-17b | Examen JSON con preguntas, opciones, clave, puntos (suma 5.0) |
| `generate_sopa_letras` | llama-4-maverick-17b | Lista de palabras del tema (grid construido algorítmicamente) |
| `generate_crucigrama` | llama-4-maverick-17b | Pistas horizontales/verticales con respuesta |
| `generate_emparejar` | llama-4-maverick-17b | Pares concepto–definición |
| `generate_cuento` | llama-4-maverick-17b | Historia educativa con moraleja e image_prompt |
| `generate_coloring_prompt` | llama-3.1-8b-instant | Traducción desc → prompt detallado en inglés |
| `grade_exam_online` | llama-3.3-70b-versatile | Calificación por pregunta con feedback pedagógico |
| `chat_response` | llama-4-scout-17b | Tutor Xali con contexto de nota (RAG simple) |

**IMPORTANTE**: Los f-strings en `system_prompt` que contengan LaTeX con `{}` deben escapar las llaves: `{{a}}`, `{{b}}` — o Python lo interpreta como variable.

---

## 9. Patrones y convenciones del código

### Backend
- Todos los modelos usan `id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- Timestamps: `created_at = Column(TIMESTAMPTZ, default=lambda: datetime.now(timezone.utc))`
- Dependencias: `db: AsyncSession = Depends(get_db)`, `current_user: User = Depends(require_role("profesor"))`
- Respuestas erróneas: `raise HTTPException(status_code=4xx, detail="mensaje")`
- Schemas separados: `*Create` (input), `*Out` (output con `model_config = ConfigDict(from_attributes=True)`)
- Rutas asíncronas: `async def endpoint_name(... db: AsyncSession ...):`
- Queries: `await db.execute(select(Model).where(...))` + `.scalar_one_or_none()` o `.scalars().all()`

### Frontend
- Siempre usar `try/catch` en llamadas API, mostrar `toast.error(err.response?.data?.detail || 'Error genérico')`
- Íconos: `import { NombreIcono } from 'lucide-react'`
- Botones primarios: `className="btn-primary"`, secundarios: `"btn-secondary"`
- Inputs: `className="input-field"`
- Modales: backdrop `fixed inset-0 bg-black/50 z-50 flex items-center justify-center`
- Tablas con scroll horizontal: `<div className="overflow-x-auto"><table ...>`
- Estados de carga: `<Loader2 className="w-5 h-5 animate-spin" />`
- Estado vacío: `<EmptyState icon={...} title="..." description="..." />`
- KaTeX en texto con ecuaciones: usar `<MathText text={content} />`

---

## 10. Cómo añadir una nueva feature

### Nuevo modelo de BD
1. Agregar clase en `backend/app/models/models.py`
2. Agregar tabla en `backend/db/init.sql`
3. Ejecutar migración manual en el contenedor:
   ```bash
   docker exec xcalificator_postgres psql -U xcalificator -d xcalificator_db -c "CREATE TABLE ..."
   ```

### Nuevo endpoint
1. Agregar en el router correspondiente en `backend/app/routers/`
2. Crear schema en `backend/app/schemas/schemas.py` si se necesita validación
3. Usar `require_role("profesor", "admin")` para proteger

### Nueva página frontend
1. Crear en `frontend/src/pages/{rol}/NuevaPagina.jsx`
2. Añadir ruta en `frontend/src/App.jsx` dentro del bloque del rol correspondiente
3. Si necesita navegación en sidebar: agregar en `frontend/src/components/Layout.jsx`

### Redesplegar
```bash
docker compose up -d --build backend frontend
```

---

## 11. Datos iniciales (init.sql)

El archivo `backend/db/init.sql` crea:
- Todas las tablas con sus constraints
- Usuario administrador por defecto: `admin@xcalificator.com` / `Admin123!`
- Índices parciales únicos en `config_porcentajes` para soportar `examen_id` y `tipo_actividad` como claves alternativas
- Tabla `notas_participacion` con UNIQUE(materia_id, periodo_id, estudiante_id)

---

## 12. Diagrama de relaciones simplificado

```
User ──< Matricula >── Materia ──< Examen ──< Nota ── User
User (profesor) ──── Materia                   │
User (estudiante) ──── Matricula               └── ChatHistory
                                               └── ChatSession
Materia ──< Examen ──< RespuestaOnline ── User
Materia ──< Asistencia ── User
Materia ──< ConfigPorcentaje [→ Examen | tipo_actividad]
Materia ──< Boletin ── User (estudiante) ── PeriodoAcademico
Materia ──< NotaParticipacion ── User (estudiante) ── PeriodoAcademico
User (profesor) ──< Herramienta [→ Materia, → Examen]
Examen ──< GrupoActividad ──< MiembroGrupo ── User
```
