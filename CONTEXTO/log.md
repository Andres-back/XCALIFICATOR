# Log del cerebro XCalificator

> **Cerebro** (vault Obsidian): documentación canónica del sistema. Pantallas↔API↔tablas en [[Matriz pantalla endpoint tabla]]. Módulos detallados en [[Calificacion OCR por imagen]].

> **Reglas del vault** (AGENTS.md, inferidas):
> 1. Este vault NO contiene código fuente.
> 2. Las notas documentan decisiones, contratos, y estado del proyecto.
> 3. Los enlaces a archivos de código deben ser relativos y por nombre.
> 4. Antes de cualquier cambio grande, actualizar este log.

---

## 2026-06-04 — Sistema completo para defensa de tesis

**Commit**: `2a927a6` — feat: sistema completo para defensa de tesis

### Cambios agrupados por subsistema

#### Backend

- **fix(`routers/auth.py:85,139`)**: bug en link de confirmación de email (`/api/auth/confirm-emailtoken=...` → `/api/auth/confirm-email?token=...`). Bloqueaba la verificación de correo en producción.
- **perf(`services/notification_service.py`)**: `notify_enrolled_students` refactorizado de N+1 a 2 queries en batch (Users + PreferenciaNotif). Antes: 60 queries para 30 estudiantes. Ahora: 2.
- **fix(`services/notification_service.py`)**: escape de caracteres Markdown problemáticos (`_`, `*`, `` ` ``, `[`) en `send_telegram` para evitar 400 de Telegram cuando el nombre del examen o materia los contiene.
- **fix(`services/notification_service.py`)**: validar `data.ok == true` en respuesta de Telegram (HTTP 200 ≠ envío exitoso, Telegram puede devolver 200 con `{"ok": false}`).

#### Frontend — Branding y dark mode

- **feat(`pages/Landing.jsx`)**: página pública de marketing (7 secciones) — Hero, Features, Cómo funciona, Resultados del piloto (4 métricas), Testimonios, CTA final, Footer.
- **feat(`pages/NotFound.jsx`)**: 404 ilustrado con mascota Xali.
- **feat(`components/ErrorState.jsx`)**: 4 escenarios (network, server, forbidden, generic) con botón reintentar.
- **feat(`components/EmptyState.jsx`)**: 5 variantes (default, search, error, celebration, upload) con soporte de ilustración.
- **feat(`components/TestimonialCard.jsx`)**: 3 variantes con avatar, cita, rating 5★.
- **feat(`hooks/useTheme.js` + `components/ThemeToggle.jsx`)**: dark mode con persistencia localStorage, sync `prefers-color-scheme`, layoutEffect anti-FOUC.
- **feat(`index.html`)**: anti-FOUC script inline + `<meta name="color-scheme" content="light dark">`.
- **feat(`tailwind.config.js`)**: `darkMode: 'class'` + paletas `brand` (naranja mango) + `accent` (indigo).
- **feat(`index.css`)**: dark variants en **21 componentes custom** (`.card*`, `.input-field`, `.btn-*`, `.badge-*`, `.skeleton`, `.table`, `.divider`, `.page-title`, `.input-label/hint/error`, scrollbar, nav-items, color-scheme).
- **feat(`components/StatCard.jsx`, `SkeletonLoader.jsx`, `Breadcrumb.jsx`)**: dark variants completas (estos 3 sub-componentes afectaban a 8+ páginas).
- **feat(`components/Layout.jsx`)**: `ROLE_THEME` con dark variants (activeItem, hoverItem, avatar, ring) — sin esto, los items activos del sidebar quedaban como pastilla clara flotando en sidebar oscura.
- **feat(`pages/Login.jsx`, `Register.jsx`)**: dark variants en labels, errores, hints, borders, checkbox. Migración de paleta `primary-*` (azul genérico) a `brand-*` (naranja) donde correspondía.
- **feat(`pages/Landing.jsx`)**: badge "Piloto activo" con `dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300` (antes era una pastilla clara flotando en hero oscuro).
- **feat(`public/xali-logo.svg`)**: logo wordmark vectorial con gradiente naranja + birrete.
- **fix(`public/icono.png`)**: usuario removió la marca de agua "ChatGPT" del logo (1.78 MB → más liviano).

#### Frontend — Validaciones de registro

- **feat(`schemas.py`)**: validadores estrictos en `UserRegister` y `AdminUserCreate`:
  - `documento`: solo dígitos, 5-20 chars
  - `correo`: solo dominios `@gmail.com` o `@hotmail.com` (case-insensitive)
  - `celular`: solo dígitos 7-15, normaliza espacios/`+`/`-`/`(`/`)`
  - `password`: min 8, 1 mayúscula, 1 número
- **feat(`pages/Register.jsx`)**: `inputMode="numeric"`, `pattern="[0-9]*"`, `replace(/\D/g, '')` en onChange — usuario no puede tipear letras en documento/celular.

#### Métricas

- Build: **2525 módulos**, **1m 7s**
- CSS: **169 KB** (gzip **26 KB**) — +47 KB por dark variants completas
- JS: **1.19 MB** (gzip **322 KB**)
- Cero errores de compilación
- Cero impacto en funcionalidades existentes

---

## 2026-06-04 — Imagenes de presentaciones sin bancos stock

- **Modulo**: presentaciones y herramientas docentes
- **Cambio**: se eliminaron los bancos de imágenes stock del flujo de presentaciones.
- **Nueva regla**: las diapositivas no usan bancos stock ni URLs externas hardcodeadas; quedan preparadas para integrarse con el proveedor interno de imágenes.
- **Despliegue**: se retiraron las variables de bancos stock y proveedor externo de imágenes de plantillas y Docker Compose.

## 2026-06-03 — Flujo OCR por imagen con fallback

- **Modulo**: [[Calificacion OCR por imagen]]
- **Pantalla**: `/profesor/calificar/imagenes/:examenId` y ruta existente `/profesor/calificar/:examenId`
- **Endpoint**: `POST /api/grading/upload`
- **Cambio**: la subida de exámenes OCR ahora usa visión por Ollama como proveedor principal y Groq Cloud como respaldo.
- **Modelo principal por defecto**: `gemma3` en API compatible con Ollama.
- **Respaldo por defecto**: `meta-llama/llama-4-scout-17b-16e-instruct` en Groq Cloud.
- **Motivo**: priorizar un proveedor Ollama-compatible y mantener continuidad cuando Ollama no esté disponible, falle o devuelva texto vacío.
- **Contrato preservado**: la respuesta sigue siendo `NotaOut`; se agregan metadatos en `detalle_json` para análisis (`ocr_provider_order`, `ocr_model`, `ocr_fallback_model`).

## 2026-06-03 — OCR usa modelo Ollama del profesor

- **Modulo**: [[Calificacion OCR por imagen]]
- **Cambio**: si el profesor configura `Modelo local para OCR` en su perfil, ese modelo se promueve como modelo principal para OCR por imagen.
- **Detalle técnico**: el perfil guarda `ocr_local_model` como `ocr_fallback_provider=ollama_vision` y `ocr_fallback_model`; el endpoint `/api/grading/upload` ahora lo interpreta como modelo principal de Ollama para imágenes.
- **Groq** se mantiene solo como respaldo y solo usa modelos Groq configurados o el fallback por defecto.

## 2026-06-03 — Persistencia de entregas OCR presenciales

- **Modulo**: [[Calificacion OCR por imagen]]
- **Cambio**: cuando el profesor toma/sube foto del examen de un estudiante, el sistema ahora registra o actualiza una entrega en `respuestas_online` con `tipo_entrega=ocr_presencial`.
- **Motivo**: permitir control de trabajos entregados para estudiantes sin teléfono, igual que en el flujo de exámenes online.
- **Persistencia final**:
  - `respuestas_online`: evidencia de entrega presencial, archivo, modelo VLM usado, calidad OCR y preguntas extraídas.
  - `notas`: calificación, retroalimentación, detalle JSON, imagen procesada y texto extraído.

---

## 2026-06-03 — Migración WhatsApp → Telegram

- **Modulo**: notificaciones multi-canal.
- **Cambio**: se eliminó la integración con Whapi/WhatsApp. La nueva integración usa **Telegram Bot API** con vinculación por **código de 6 dígitos + /start al bot**.
- **Razón**: la vinculación por WhatsApp requería infraestructura de pago. Telegram es gratuito, más simple, y mejor para el público objetivo (estudiantes colombianos con planes de datos limitados).
- **Persistencia**:
  - `users.telegram_chat_id`, `telegram_link_code`, `telegram_link_code_expires`
  - `preferencias_notif.acepta_telegram` (reemplaza `acepta_whatsapp`)
  - 184 notificaciones viejas migradas de `canal='whatsapp'` a `canal='telegram'`
- **Migración**: `backend/db/migrations/001_add_telegram_remove_whatsapp.sql` (idempotente, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).
- **Env vars**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_URL` (última opcional; si no, polling automático).
- **Bot**: dos modos — webhook (con HTTPS) o polling (background task). Polling arranca como `asyncio.create_task` en `main.py:startup_telegram_bot`.

---

## 2026-06-03 — OCR multi-proveedor con calidad

- **Modulo**: [[Calificacion OCR por imagen]]
- **Cambios**:
  - `grading.py:_build_image_ocr_config` refactorizado: prioridad de modelos es `DB > OLLAMA_CLOUD_OCR_MODEL > OCR_OLLAMA_MODEL > default "gemma3"`.
  - Fallback chain forzado: primary=`ollama_vision`, fallback=`groq_vision` (independiente de la config del profesor).
  - URL auto-deriva a `https://ollama.com` si el modelo tiene `:cloud`, `qwen*` o `deepseek*`.
  - API key prioridad: DB > `OLLAMA_CLOUD_API_KEY` env > `OLLAMA_API_KEY` env.
  - OCR quality gate: `baja` (<50 chars o 0 preguntas) → nota pendiente revisión; `media` → warning; `alta` → normal.
- **Decisión arquitectónica**: vision models > PaddleOCR para manuscritos.

## 2026-06-03 — Modo grupal completo

- **Modulo**: actividades grupales.
- **Cambio**: `grupos_actividad` y `miembros_grupo` permiten crear grupos para exámenes, con invitaciones, líder, y aceptación.
- **Endpoints**: `/api/grupos/`, `/api/grupos/{id}/examen`, `/api/grupos/{id}/invitar`.
- **UI**: `profesor/Materias.jsx` y `profesor/MateriaDetail.jsx` tienen tabs de grupos.

## 2026-06-02 — Boletines PDF + Asistencia PDF

- **Modulo**: reportes.
- **Cambio**: sistema completo de impresión de boletines por materia o por estudiante, con paginación y diseño PDF optimizado.
- **Endpoints**: `/api/reportes/boletin/{estudiante_id}`, `/api/reportes/boletines-global/{periodo_id}`, `/api/reportes/asistencia/{materia_id}/export-pdf`.

## 2026-06-02 — Tesis impacto (kappa, Likert, cualitativo)

- **Modulo**: análisis de impacto de la tesis.
- **Cambio**: endpoints para medir el impacto del piloto en la IE Comercial San Agustín.
  - `GET /api/tesis/tiempos/resumen` — distribución de tiempos de calificación (pre/post).
  - `GET /api/tesis/concordancia/kappa` — Cohen's Kappa ponderado inter-evaluador (IA vs humano).
  - `GET /api/tesis/encuestas/resumen` — Likert agregado.
  - `GET /api/tesis/cualitativo` — análisis cualitativo de respuestas abiertas con stop-words ES.
- **Encuesta**: `/encuesta/impacto` — encuesta Likert 1-5 + abierta, para los 3 roles.

## 2026-05-XX — Smart grading

- **Modulo**: calificación.
- **Cambio**: preguntas `seleccion_multiple`, `verdadero_falso`, `crucigrama`, `sopa_letras`, `emparejar` se califican **localmente sin LLM** (comparación normalizada). Solo `desarrollo` y `respuesta_corta` se envían a Groq.
- **Beneficio**: ahorra ~80% de tokens de Groq. Latencia 3-5s vs 30-90s con LLM.

## 2026-05-XX — Chat Xali (RAG tutor)

- **Modulo**: chat pedagógico.
- **Cambio**: tutor con RAG sobre el examen del estudiante.
- **Pipeline**:
  1. Carga `Nota` + `Examen` + `Materia`
  2. Construye contexto SIN clave de respuestas (seguridad)
  3. Valida relevancia con `classify_chat_relevance` (modelo `llama-3.1-8b-instant`)
  4. Si no es relevante → respuesta canned
  5. Genera respuesta con `rag_chat` (modelo `meta-llama/llama-4-scout-17b-16e-instruct`)
  6. Persiste historial en `ChatHistory`
- **Límites**: 5 preguntas/sesión, 10 min/sesión, cooldown 10 min.

## 2026-05-XX — Presentaciones con Presenton

- **Modulo**: presentaciones IA.
- **Cambio**: integración completa con **Presenton** (contenedor Docker `xcalificator_presenton`) para generar PPTX desde prompts.
- **Pipeline**:
  1. Login con `PRESENTON_AUTH_USERNAME/PASSWORD` → cookie de sesión (cache 20 días)
  2. `POST /api/v1/ppt/presentation/generate` con prompt + plantilla
  3. Descarga el PPTX, guarda en `/uploads/presentations/{id}.pptx`
  4. Retorna URL pública `/uploads/presentations/{id}.pptx`
- **Endpoints**:
  - `POST /api/presentaciones/clase` — clase nueva
  - `POST /api/presentaciones/repaso-examen/{examen_id}` — repaso automático de las 5 preguntas más falladas
  - `POST /api/presentaciones/boletin/{materia_id}/{periodo_id}` — resumen de período
- **Sin Pollinations ni Cloudflare** (eliminados por issues de licencias en bancos stock).

## 2026-05-XX — AI config global + override por profesor

- **Modulo**: configuración de IA.
- **Cambio**: jerarquía de configuración IA:
  1. Override por profesor (`profesor_ai_configs`)
  2. Config global (`ai_global_config`)
  3. Variables de entorno (`.env`)
  4. Default (Groq)
- **Endpoints admin**: `GET/PUT /api/admin/ai-config`, `GET/PUT /api/admin/ai-configs/global`, `GET /api/admin/ai-configs/{profesor_id}`.
- **Endpoints profesor**: `GET /api/auth/me/local-ai-config`, `PUT /api/auth/me/local-ai-config`.
- **Frontend**: `pages/admin/AIConfig.jsx` con editor global + override.

## 2026-04-XX — Diseño system unificado

- **Modulo**: frontend.
- **Cambio**: sistema de diseño con tokens semánticos.
  - Paleta: `primary` (azul), `admin` (violet), `profesor` (indigo), `estudiante` (emerald), `surface` (neutrales).
  - Tipografía: Inter (sans) + Poppins (display).
  - Sombras: `shadow-card`, `shadow-card-md`, `shadow-card-lg`, `shadow-glow-{color}`.
  - Componentes: `.btn-*`, `.card-*`, `.badge-*`, `.input-field`, `.table`, `.divider`, `.skeleton`.
  - Animaciones: `fade-up`, `fade-in`, `scale-in`, `slide-in-left`, `shimmer`.

## 2026-04-XX — OCR con doble valoración

- **Modulo**: [[Calificacion OCR por imagen]].
- **Cambio**: el OCR devuelve calidad (`alta`/`media`/`baja`). Si es `baja` o `media`, se marca la nota como `requiere_revision_profesor=True` para que el profesor la revise manualmente. Esto es la "segunda valoración" del método científico.
- **Razón**: la IA puede equivocarse con manuscritos ilegibles. La segunda valoración humana es esencial para la rúbrica.

## 2026-04-XX — Backend inicial

- **Modulo**: infraestructura.
- **Cambio**: FastAPI + SQLAlchemy async + PostgreSQL + Redis + Docker Compose.
- **Modelos**: 18 tablas (User, Sesion, Materia, Examen, Nota, PreferenciaNotif, Notificacion, RespuestaOnline, ChatHistory, APIUsageLog, AuditLog, PeriodoAcademico, Herramienta, Asistencia, ConfigPorcentaje, Boletin, NotaParticipacion, GrupoActividad, MiembroGrupo, ChatSession, TiempoEvaluacion, EncuestaImpacto).
- **Routers**: 16 archivos, ~120 endpoints.
- **Servicios**: groq, ocr, pdf, notification, nota, vision_grading, presentation, presenton, telegram_bot.

---

## Próximos pasos sugeridos (no en log)

Para llevar el sistema a "tesis funcional" defendible, quedan:

### 🔴 Crítico (1 día)
1. **Proteger `/uploads`** con auth o mover a endpoint autenticado (privacidad de exámenes de estudiantes).
2. **Cambiar `JWT_SECRET`** en `.env` de `"dev-only-change-me"` a valor aleatorio fuerte antes de deploy.
3. **Actualizar README + copilot-instructions** para reflejar OCR con Ollama (no PaddleOCR) y remover Pollinations.
4. **Validar `TELEGRAM_WEBHOOK_URL`** con secret token en producción.

### 🟡 Importante (1 semana)
5. **Reintentos SMTP** con `tenacity` (backoff exponencial).
6. **Endpoint de borrador** para exámenes online (autosave cada N segundos).
7. **Scheduler** para recordatorios `examen_proximo` (24h antes).
8. **Limpiar servicios muertos** (`pexels_service.pyc`, `pixabay_service.pyc`, `boletin_pdf_service.pyc`, `google_slides_service.py` no usado).
9. **Dark mode sistemático** en los 23 dashboards internos restantes (los más críticos ya tienen el patrón).

### 🟢 Mejora (2 semanas)
10. **Tests E2E** de los 9 flujos críticos (registro, OCR, chat, presentaciones, etc.).
11. **Rotar Admin123!** al primer login.
12. **Crear seeds reproducibles** de demo data (3 prof, 30 est, 2 mat, 4 exámenes, 50 notas).
13. **CORS configurable por env** para dominios de producción.
