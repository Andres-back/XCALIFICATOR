const overviewKpis = [
  { value: "13", label: "routers backend" },
  { value: "20", label: "modelos DB" },
  { value: "3", label: "roles app" },
  { value: "6", label: "servicios IA/OCR/infra" },
];

const architectureNodes = [
  {
    id: "frontend",
    title: "Frontend React",
    info: "Rutas por rol, estado con Zustand y interceptor Axios.",
    status: "estable",
    desktop: { x: 3, y: 34 },
    mobile: { x: 4, y: 8 },
  },
  {
    id: "nginx",
    title: "Nginx Gateway",
    info: "Proxy de /api al backend y entrega de frontend.",
    status: "estable",
    desktop: { x: 21, y: 34 },
    mobile: { x: 54, y: 8 },
  },
  {
    id: "backend",
    title: "FastAPI Core",
    info: "Auth, examenes, grading, chat, reportes y admin.",
    status: "estable",
    desktop: { x: 39, y: 34 },
    mobile: { x: 4, y: 27 },
  },
  {
    id: "postgres",
    title: "PostgreSQL",
    info: "Datos transaccionales: usuarios, notas, boletines.",
    status: "estable",
    desktop: { x: 57, y: 18 },
    mobile: { x: 54, y: 27 },
  },
  {
    id: "redis",
    title: "Redis",
    info: "Rate limiting, llaves temporales y cache puntual.",
    status: "critico",
    desktop: { x: 57, y: 50 },
    mobile: { x: 4, y: 46 },
  },
  {
    id: "paddle",
    title: "PaddleOCR",
    info: "Extraccion OCR para imagenes y PDF.",
    status: "variado",
    desktop: { x: 75, y: 18 },
    mobile: { x: 54, y: 46 },
  },
  {
    id: "groq",
    title: "Groq LLM",
    info: "Generacion, calificacion y tutor Xali.",
    status: "variado",
    desktop: { x: 75, y: 50 },
    mobile: { x: 4, y: 65 },
  },
  {
    id: "smtp",
    title: "SMTP / Whapi",
    info: "Notificaciones por correo y WhatsApp.",
    status: "variado",
    desktop: { x: 39, y: 70 },
    mobile: { x: 54, y: 65 },
  },
  {
    id: "google",
    title: "Google OAuth",
    info: "Autenticacion federada para login social.",
    status: "variado",
    desktop: { x: 21, y: 70 },
    mobile: { x: 4, y: 84 },
  },
];

const architectureEdges = [
  ["frontend", "nginx"],
  ["nginx", "backend"],
  ["backend", "postgres"],
  ["backend", "redis"],
  ["backend", "paddle"],
  ["backend", "groq"],
  ["backend", "smtp"],
  ["backend", "google"],
];

const architectureLanes = [
  {
    id: "entry",
    title: "1) Entrada y enrutamiento",
    description: "Por aqui entra cada request antes de tocar la logica de negocio.",
    nodes: ["frontend", "nginx"],
  },
  {
    id: "core",
    title: "2) Core transaccional",
    description: "El backend orquesta reglas, permisos y coordinacion con servicios.",
    nodes: ["backend"],
  },
  {
    id: "state",
    title: "3) Estado y consistencia",
    description: "Persistencia y control de throttling; claves para escalar carga.",
    nodes: ["postgres", "redis"],
  },
  {
    id: "external",
    title: "4) Integraciones externas",
    description: "Dependencias de IA, OCR y notificacion con latencia variable.",
    nodes: ["groq", "paddle", "smtp", "google"],
  },
];

const architectureScaleHints = {
  frontend: "Optimizar bundles y cache de assets para reducir tiempo inicial.",
  nginx: "Ajustar keep-alive, timeouts y compresion para mayor throughput.",
  backend: "Separar rutas pesadas y medir p95 por endpoint antes de escalar replicas.",
  postgres: "Indices por consultas calientes y monitoreo de conexiones activas.",
  redis: "Mantener failover y alertas de memoria para no perder rate limiting.",
  groq: "Configurar retry con fallback de modelo y limites por tipo de tarea.",
  paddle: "Agregar cola y reintentos para picos de OCR.",
  smtp: "Encolar envios para no bloquear respuestas HTTP.",
  google: "Manejar degradacion elegante cuando OAuth externo no responde.",
};

const criticalScalingPath = ["frontend", "nginx", "backend", "postgres", "redis", "groq"];

const flows = [
  {
    id: "auth",
    title: "Auth y sesion",
    summary: "Registro/login local o Google, JWT con refresh y cierre de sesion.",
    steps: [
      "Frontend envia login o registro a /api/auth.",
      "Backend valida credenciales y estado de usuario.",
      "Crea Sesion con IP/dispositivo y emite JWT access/refresh.",
      "Interceptor Axios intenta refresh cuando recibe 401.",
      "Si refresh falla, limpia storage y vuelve a /login.",
    ],
    hotspots: [
      "Token refresh invalido crea bucle de login.",
      "Errores SMTP en registro pueden ocultar confirmacion de correo.",
      "Sesiones abiertas no cerradas distorsionan auditoria.",
    ],
  },
  {
    id: "materias",
    title: "Materias y matriculas",
    summary: "Profesores crean materias; estudiantes se inscriben por codigo.",
    steps: [
      "Profesor/admin crea materia en /api/materias con codigo unico.",
      "Estudiante usa codigo para /api/materias/inscribir.",
      "Backend crea Matricula y evita duplicados por constraint unico.",
      "Profesor consulta inscritos en /api/materias/{id}/estudiantes.",
      "UI de detalle de materia habilita tabs segun rol.",
    ],
    hotspots: [
      "Codigo repetido o invalido bloquea inscripcion.",
      "Permisos de propietario de materia deben validarse siempre.",
      "Listados grandes sin paginacion ralentizan vista.",
    ],
  },
  {
    id: "profesor-student-drilldown",
    title: "Profesor: foco por estudiante",
    summary: "Busqueda rapida y vista consolidada de actividades, asistencia y boletin por periodo.",
    steps: [
      "Profesor abre /profesor/materia/:id#estudiantes.",
      "Selecciona periodo y filtra estudiante por nombre/correo/documento.",
      "Frontend consulta /api/reportes/estudiante/{materia_id}/{periodo_id}/{estudiante_id}.",
      "Backend consolida actividades, asistencia, participacion y boletin en una sola respuesta.",
      "Profesor decide si califica pendiente, revisa notas o valida publicacion de boletin.",
    ],
    hotspots: [
      "Si no hay periodo configurado, el detalle queda sin contexto academico.",
      "Materias sin config de porcentajes muestran nota proyectada limitada.",
      "Dataset muy grande requiere paginacion para mantener fluidez.",
    ],
  },
  {
    id: "examen-online",
    title: "Examen online",
    summary: "Creacion, activacion y resolucion online con fecha limite.",
    steps: [
      "Profesor crea examen en /api/examenes y define fechas.",
      "Backend guarda contenido_json y clave_respuestas separada.",
      "Estudiante abre examen activo y envia respuestas_json.",
      "RespuestaOnline registra intento unico por estudiante/examen.",
      "Profesor revisa resultados en notas y calificaciones.",
    ],
    hotspots: [
      "Fecha activacion/limite mal configurada bloquea examenes validos.",
      "Sin autosave frontend el estudiante puede perder respuestas.",
      "Modo grupal requiere validaciones de lider y miembros.",
    ],
  },
  {
    id: "grading-online",
    title: "Calificacion online IA",
    summary: "Correccion automatica mezclando reglas objetivas y Groq.",
    steps: [
      "Endpoint /api/grading/grade-online recibe examen y estudiante.",
      "Backend separa preguntas objetivas vs abiertas.",
      "Objetivas se corrigen localmente; abiertas se envian a Groq.",
      "Nota final y detalle_json se guardan en tabla Nota.",
      "Retroalimentacion queda disponible para estudiante y chat Xali.",
    ],
    hotspots: [
      "Timeout de Groq rompe experiencia en correccion masiva.",
      "Formato JSON inesperado del LLM produce errores 500.",
      "Falta de retries puede elevar tasa de reproceso manual.",
    ],
  },
  {
    id: "grading-ocr",
    title: "Calificacion OCR",
    summary: "Subida de imagen/PDF, OCR y evaluacion asistida por IA.",
    steps: [
      "Profesor sube archivo en /api/grading/upload.",
      "Backend preprocesa, envia a PaddleOCR y obtiene texto.",
      "Texto extraido se compara con clave por Groq grading.",
      "Se guarda Nota con evidencia de texto e imagen procesada.",
      "Resultado pasa al flujo de reportes y boletines.",
    ],
    hotspots: [
      "OCR pobre por imagen de baja calidad.",
      "Uploads sin limpieza consumen disco progresivamente.",
      "Fallos intermitentes de paddleocr requieren retries.",
    ],
  },
  {
    id: "ocr-answer-sheet",
    title: "Hoja de respuesta OCR",
    summary: "Plantilla de descarga con prefijos (R1, R2...) para lectura OCR mas estable.",
    steps: [
      "Profesor activa Plantilla OCR en /profesor/herramientas al generar el examen.",
      "Define prefijo (ej: R), lineas para abiertas y si incluye hoja OCR adicional.",
      "Backend guarda config OCR en config_json y metadata del contenido.",
      "Al descargar PDF estudiante, se agregan campos tipo R1: _____ y, si aplica, tabla final de hoja OCR.",
      "OCR parser reconoce formatos R1:, RESPUESTA 1:, R-1) y los mapea por numero de pregunta.",
    ],
    hotspots: [
      "Si el estudiante no usa el prefijo acordado, baja la precision de parseo.",
      "Fotos inclinadas o con poca luz afectan deteccion de lineas de respuesta.",
      "Prefijos muy largos o ambiguos pueden confundir el flujo de captura.",
    ],
  },
  {
    id: "generation-tools",
    title: "Generacion IA de herramientas",
    summary: "Examen, crucigrama, sopa, emparejar, cuento y colorear.",
    steps: [
      "Profesor usa /api/generate/* o /api/herramientas/generate.",
      "Groq arma contenido JSON segun tipo solicitado.",
      "Backend valida estructura, puntaje y guarda Herramienta.",
      "Asignar herramienta crea Examen reutilizable en materia.",
      "Frontend renderiza cada tipo con componente especializado.",
    ],
    hotspots: [
      "Rate limit de 10 req/min bloquea sesiones de creacion intensiva.",
      "Prompt mal definido entrega formatos incompletos.",
      "Errores de parse en tipos nuevos requieren schema robusto.",
    ],
  },
  {
    id: "asistencia",
    title: "Asistencia y participacion",
    summary: "Registro diario y conversion a nota para reporte ponderado.",
    steps: [
      "Profesor marca asistencia por fecha en /api/asistencia/materia/{id}.",
      "Backend hace upsert por estudiante/dia con estado.",
      "Reportes calculan nota asistencia: 5.0 - ausencias*0.3.",
      "Participacion se guarda en lote por periodo/materia.",
      "Ambas actividades entran a ConfigPorcentaje.",
    ],
    hotspots: [
      "Fechas fuera de periodo alteran calculo ponderado.",
      "Participacion vacia se interpreta como 0.0.",
      "Export PDF puede fallar por bloqueos de I/O.",
    ],
  },
  {
    id: "reportes-boletines",
    title: "Reportes y boletines",
    summary: "Consolidacion por periodo y publicacion de boletin final.",
    steps: [
      "Profesor configura porcentaje de actividades a 100%.",
      "GET reporte arma tabla por estudiante y actividad.",
      "_calculate_weighted_grade suma notas con cap 5.0.",
      "POST boletin crea/actualiza registros por estudiante.",
      "Publicacion dispara notificaciones y auditoria.",
    ],
    hotspots: [
      "Query N+1 penaliza materias con muchos estudiantes.",
      "Boletin parcial sin transaccion puede dejar inconsistencia.",
      "Config incompleta genera finales no esperados.",
    ],
  },
  {
    id: "chat-xali",
    title: "Tutor Xali",
    summary: "Chat contextual con limite de preguntas y tiempo de sesion.",
    steps: [
      "Estudiante abre /estudiante/chat/:notaId.",
      "Backend carga Nota + detalle_json + retroalimentacion.",
      "Groq rag_chat responde con tono pedagogico.",
      "Se guarda ChatHistory y se actualiza ChatSession.",
      "Sesion se cierra por limite de preguntas o tiempo.",
    ],
    hotspots: [
      "Mensajes largos sin streaming pueden parecer congelados.",
      "Error interno no sanitizado puede exponer detalle tecnico.",
      "Sin contador visible el limite de chat sorprende al usuario.",
    ],
  },
  {
    id: "admin-observability",
    title: "Admin y observabilidad",
    summary: "KPIs globales, auditoria, uso API y boletines globales.",
    steps: [
      "Admin consulta /api/admin/stats para estado global.",
      "Gestiona usuarios y roles en /api/admin/users.",
      "Revisa /api/admin/audit-log para trazabilidad.",
      "Monitorea tokens/costo desde /api/admin/api-usage.",
      "Genera boletines globales por grado y periodo.",
    ],
    hotspots: [
      "Listados sin paginacion degradan experiencia con muchos usuarios.",
      "Cambios de rol sin doble confirmacion son riesgosos.",
      "Sin dashboard de salud, incidentes se detectan tarde.",
    ],
  },
];

const roleJourneys = [
  {
    id: "admin",
    title: "Admin",
    summary: "Control transversal de usuarios, periodos, auditoria y consumo IA.",
    screens: [
      "/admin",
      "/admin/users",
      "/admin/materias",
      "/admin/periodos",
      "/admin/boletines",
      "/admin/audit",
    ],
    path: [
      "Login -> Dashboard admin.",
      "Gestion de usuarios (rol, grado, activo, reset password).",
      "Configuracion de periodos academicos y porcentajes.",
      "Monitoreo de auditoria y consumo de modelos.",
      "Consulta de boletines globales por grado.",
    ],
    risks: [
      "Cambios de rol sin control de impacto.",
      "Sin paginacion en tablas masivas.",
      "Acciones destructivas sin rollback guiado.",
    ],
  },
  {
    id: "profesor",
    title: "Profesor",
    summary: "Opera el ciclo academico completo: crear, evaluar, reportar y publicar.",
    screens: [
      "/profesor/materias",
      "/profesor/materia/:id#examenes",
      "/profesor/materia/:id#estudiantes",
      "/profesor/materia/:id#calificaciones",
      "/profesor/materia/:id#reportes",
      "/profesor/materia/:id#boletines",
      "/profesor/herramientas",
    ],
    path: [
      "Crear materia y compartir codigo de inscripcion.",
      "Buscar estudiante y revisar su ficha consolidada por periodo.",
      "Generar o crear examenes (manual o IA).",
      "Calificar online/OCR y ajustar retroalimentacion.",
      "Configurar porcentajes y validar suma 100%.",
      "Generar/publicar boletines del periodo.",
    ],
    risks: [
      "Configuracion de porcentajes incompleta.",
      "Calificacion OCR con baja precision por imagen.",
      "Falta de validacion previa antes de publicar boletin.",
    ],
  },
  {
    id: "estudiante",
    title: "Estudiante",
    summary: "Resuelve examenes, consulta notas, boletines y usa tutor Xali.",
    screens: [
      "/estudiante",
      "/estudiante/notas",
      "/estudiante/examen/:id",
      "/estudiante/boletin",
      "/estudiante/chat/:notaId",
      "/perfil",
    ],
    path: [
      "Inscribirse por codigo de materia.",
      "Resolver examen dentro de ventana activa.",
      "Consultar nota y retroalimentacion detallada.",
      "Pedir explicaciones al tutor Xali con contexto.",
      "Revisar boletines por periodo.",
    ],
    risks: [
      "Perdida de respuestas por falta de autosave.",
      "Sesion chat agotada sin anticipacion visual.",
      "Redireccion brusca al expirar token.",
    ],
  },
];

const routerMap = [
  {
    router: "Auth",
    prefix: "/api/auth",
    purpose: "Registro, login local/Google, refresh y perfil.",
    endpoints: [
      "POST /register",
      "POST /login",
      "POST /google",
      "POST /refresh",
      "GET /me",
      "PATCH /me",
    ],
    dependencies: ["PostgreSQL", "JWT", "Google OAuth", "SMTP"],
  },
  {
    router: "Materias",
    prefix: "/api/materias",
    purpose: "Creacion de materias, inscripcion y listado de estudiantes.",
    endpoints: [
      "POST /",
      "GET /mis-materias",
      "GET /{id}/estudiantes",
      "POST /inscribir",
      "GET /mis-inscripciones",
    ],
    dependencies: ["users", "materias", "matriculas"],
  },
  {
    router: "Examenes",
    prefix: "/api/examenes",
    purpose: "CRUD de examenes, respuestas online y notas base.",
    endpoints: [
      "POST /",
      "GET /materia/{id}",
      "GET /{id}",
      "PATCH /{id}",
      "POST /responder/{id}",
      "GET /mis-notas",
    ],
    dependencies: ["examenes", "respuestas_online", "notas"],
  },
  {
    router: "Generation",
    prefix: "/api/generate",
    purpose: "Generacion IA de examenes y actividades didacticas.",
    endpoints: [
      "POST /exam",
      "POST /sopa-letras",
      "POST /crucigrama",
      "POST /emparejar",
      "POST /cuento",
      "POST /para-colorear",
    ],
    dependencies: ["Groq", "Pollinations", "Redis rate limit"],
  },
  {
    router: "Grading",
    prefix: "/api/grading",
    purpose: "Calificacion por OCR y evaluacion online asistida por IA.",
    endpoints: ["POST /upload", "POST /grade-online/{examen_id}/{estudiante_id}"],
    dependencies: ["PaddleOCR", "Groq", "uploads", "notas"],
  },
  {
    router: "Reportes",
    prefix: "/api/reportes",
    purpose: "Config de porcentajes, reporte por periodo y boletines.",
    endpoints: [
      "GET /config/{materia_id}/{periodo_id}",
      "POST /config/{materia_id}",
      "GET /materia/{materia_id}/periodo/{periodo_id}",
      "GET /estudiante/{materia_id}/{periodo_id}/{estudiante_id}",
      "POST /boletin/{materia_id}/{periodo_id}",
      "GET /mis-boletines",
      "POST /participacion/{materia_id}/{periodo_id}",
    ],
    dependencies: ["config_porcentajes", "boletines", "asistencias", "notas_participacion"],
  },
  {
    router: "Asistencia",
    prefix: "/api/asistencia",
    purpose: "Registro por fecha y exportacion PDF de asistencia.",
    endpoints: [
      "POST /materia/{id}",
      "GET /materia/{id}",
      "GET /materia/{id}/export-pdf",
    ],
    dependencies: ["asistencias", "pdf_service"],
  },
  {
    router: "Herramientas",
    prefix: "/api/herramientas",
    purpose: "CRUD de herramientas IA y asignacion a materias.",
    endpoints: ["GET /", "POST /", "POST /generate", "POST /{id}/asignar"],
    dependencies: ["herramientas", "examenes", "Groq"],
  },
  {
    router: "Chat",
    prefix: "/api/chat",
    purpose: "Tutor Xali con contexto de nota y control de sesion.",
    endpoints: ["POST /", "GET /{nota_id}/history", "GET /session/{nota_id}"],
    dependencies: ["chat_sessions", "chat_history", "Groq"],
  },
  {
    router: "Admin",
    prefix: "/api/admin",
    purpose: "KPIs, gestion de usuarios, auditoria y uso API.",
    endpoints: [
      "GET /stats",
      "GET /users",
      "PATCH /users/{id}",
      "GET /audit-log",
      "GET /api-usage",
      "GET /boletines-global/{periodo_id}",
    ],
    dependencies: ["users", "audit_logs", "api_usage_logs", "boletines"],
  },
  {
    router: "Periodos",
    prefix: "/api/periodos",
    purpose: "Consulta global y actualizacion masiva de periodos.",
    endpoints: ["GET /", "POST /bulk"],
    dependencies: ["periodos_academicos"],
  },
  {
    router: "Grupos",
    prefix: "/api/grupos",
    purpose: "Flujos de examen grupal y administracion de miembros.",
    endpoints: [
      "POST /examen/{examen_id}",
      "POST /{grupo_id}/join",
      "PATCH /{grupo_id}/member/{id}",
      "GET /examen/{examen_id}",
    ],
    dependencies: ["grupos_actividad", "miembros_grupo", "examenes"],
  },
  {
    router: "Notifications",
    prefix: "/api/notifications",
    purpose: "Preferencias y envio de notificaciones por canal.",
    endpoints: ["GET /preferences", "PATCH /preferences", "GET /history"],
    dependencies: ["preferencias_notif", "notificaciones", "SMTP", "Whapi"],
  },
  {
    router: "Tesis",
    prefix: "/api/tesis",
    purpose: "Indicadores de impacto: tiempos, concordancia kappa, encuestas Likert y cualitativo.",
    endpoints: [
      "POST /tiempos",
      "GET /tiempos/resumen",
      "GET /concordancia/kappa",
      "POST /encuestas",
      "GET /encuestas/resumen",
      "GET /cualitativo",
    ],
    dependencies: ["tiempos_evaluacion", "encuestas_impacto", "notas", "examenes"],
  },
];

const entities = [
  {
    name: "User",
    table: "users",
    purpose: "Identidad, rol y datos base del actor del sistema.",
    writesBy: ["auth", "admin"],
    readBy: ["todas las capas"],
    risk: "cambio de rol impacta permisos de todo el sistema",
  },
  {
    name: "Materia",
    table: "materias",
    purpose: "Unidad academica principal asociada a profesor.",
    writesBy: ["materias", "admin"],
    readBy: ["profesor", "estudiante", "reportes"],
    risk: "codigo duplicado bloquea inscripciones",
  },
  {
    name: "Matricula",
    table: "matriculas",
    purpose: "Relacion estudiante-materia.",
    writesBy: ["materias"],
    readBy: ["examenes", "reportes", "asistencia"],
    risk: "duplicados por falta de constraint al migrar",
  },
  {
    name: "Examen",
    table: "examenes",
    purpose: "Contenido evaluable, fechas y modo de resolucion.",
    writesBy: ["examenes", "herramientas"],
    readBy: ["resolver examen", "grading", "chat"],
    risk: "fechas invalidas cierran examenes antes de tiempo",
  },
  {
    name: "RespuestaOnline",
    table: "respuestas_online",
    purpose: "Intento enviado por estudiante.",
    writesBy: ["examenes"],
    readBy: ["grading"],
    risk: "payload incompleto causa nota sesgada",
  },
  {
    name: "Nota",
    table: "notas",
    purpose: "Resultado final y detalle de evaluacion.",
    writesBy: ["grading", "examenes"],
    readBy: ["notas", "chat", "reportes"],
    risk: "detalle_json muy grande complica reportes",
  },
  {
    name: "Asistencia",
    table: "asistencias",
    purpose: "Registro diario por estudiante y materia.",
    writesBy: ["asistencia"],
    readBy: ["reportes", "pdf"],
    risk: "fechas fuera de periodo alteran nota asistencia",
  },
  {
    name: "NotaParticipacion",
    table: "notas_participacion",
    purpose: "Calificacion de participacion por periodo.",
    writesBy: ["reportes"],
    readBy: ["reportes", "boletines"],
    risk: "si no existe se asume 0.0",
  },
  {
    name: "ConfigPorcentaje",
    table: "config_porcentajes",
    purpose: "Regla de pesos por actividad para nota final.",
    writesBy: ["reportes"],
    readBy: ["reportes", "boletines"],
    risk: "sumatoria distinta de 100 rompe consistencia",
  },
  {
    name: "Boletin",
    table: "boletines",
    purpose: "Consolidado final por estudiante/materia/periodo.",
    writesBy: ["reportes"],
    readBy: ["profesor", "estudiante", "admin"],
    risk: "publicacion parcial sin transaccion",
  },
  {
    name: "Herramienta",
    table: "herramientas",
    purpose: "Repositorio de actividades IA reutilizables.",
    writesBy: ["herramientas", "generation"],
    readBy: ["profesor"],
    risk: "schemas diferentes por tipo dificultan validacion",
  },
  {
    name: "ChatSession + ChatHistory",
    table: "chat_sessions / chat_history",
    purpose: "Control de preguntas y trazabilidad conversacional.",
    writesBy: ["chat"],
    readBy: ["chat"],
    risk: "limites de sesion poco visibles para usuario final",
  },
];

const failures = [
  {
    title: "Refresh token invalido",
    severity: "alta",
    layer: "frontend",
    trigger: "refresh corrupto o expirado",
    symptom: "redirige a login repetidamente",
    observe: "frontend/src/api.js interceptor",
    fix: "toast + limpieza segura + re-login guiado",
  },
  {
    title: "Nginx 502/504",
    severity: "alta",
    layer: "nginx",
    trigger: "backend saturado o down",
    symptom: "acciones bloqueadas por error de red",
    observe: "nginx logs + health endpoint",
    fix: "timeouts realistas + health check + retries UI",
  },
  {
    title: "Rate limit degradado si Redis cae (mitigado)",
    severity: "alta",
    layer: "db",
    trigger: "Redis no responde",
    symptom: "la proteccion cambia a modo fallback en memoria",
    observe: "core/rate_limiter + redis ping",
    fix: "fallback activo + monitorear cabecera X-RateLimit-Mode",
  },
  {
    title: "JSON invalido desde LLM",
    severity: "media",
    layer: "backend",
    trigger: "respuesta no compatible con schema esperado",
    symptom: "error 500 al generar/calificar",
    observe: "groq_service parsing",
    fix: "validacion pydantic + fallback de parse",
  },
  {
    title: "Timeout de Groq",
    severity: "media",
    layer: "externo",
    trigger: "latencia alta o cuota agotada",
    symptom: "spinner largo sin resultado",
    observe: "api_usage_logs + traces del router",
    fix: "retry exponencial + modelo fallback",
  },
  {
    title: "OCR inestable",
    severity: "media",
    layer: "externo",
    trigger: "imagen de baja calidad / paddle saturado",
    symptom: "nota imprecisa o incompleta",
    observe: "ocr_service + texto_extraido",
    fix: "preprocesado adicional + cola de revision manual",
  },
  {
    title: "Sin autosave examen (mitigado)",
    severity: "media",
    layer: "frontend",
    trigger: "recarga accidental",
    symptom: "si falla storage local puede perderse progreso",
    observe: "ResolverExamen estado local",
    fix: "autosave con debounce + restore + limpieza post-envio",
  },
  {
    title: "Config porcentajes inconsistente",
    severity: "alta",
    layer: "backend",
    trigger: "sumatoria distinta de 100",
    symptom: "nota final incorrecta o guardado rechazado",
    observe: "POST /api/reportes/config",
    fix: "validador visual en frontend + bloqueo hard",
  },
  {
    title: "Boletin parcial",
    severity: "alta",
    layer: "backend",
    trigger: "error en lote de generacion",
    symptom: "algunos alumnos sin boletin",
    observe: "reportes router + audit logs",
    fix: "transaccion atomica por lote",
  },
  {
    title: "Sesion chat agotada",
    severity: "baja",
    layer: "backend",
    trigger: "max preguntas o tiempo alcanzado",
    symptom: "429 en chat",
    observe: "chat_sessions + endpoint session",
    fix: "contador visible + boton nueva sesion",
  },
  {
    title: "Errores tecnicos expuestos",
    severity: "media",
    layer: "backend",
    trigger: "exception no sanitizada",
    symptom: "usuario ve detalle interno",
    observe: "responses 500 en chat/grading",
    fix: "mensaje generico al cliente y log interno",
  },
  {
    title: "CORS mal configurado",
    severity: "media",
    layer: "backend",
    trigger: "origins productivos no definidos",
    symptom: "frontend no consume API en deploy",
    observe: "main.py CORS + consola navegador",
    fix: "ALLOWED_ORIGINS desde .env",
  },
  {
    title: "Uploads sin limpieza",
    severity: "media",
    layer: "db",
    trigger: "acumulacion de archivos OCR",
    symptom: "disco lleno y lentitud",
    observe: "backend/uploads tamano total",
    fix: "job diario de limpieza por antiguedad",
  },
];

const improvements = [
  {
    title: "Autosave de respuestas en ResolverExamen",
    horizon: "quick",
    impact: "alto",
    effort: "2h",
    note: "Implementado: evita perdida de trabajo estudiantil en recargas.",
  },
  {
    title: "Toast de expiracion JWT",
    horizon: "quick",
    impact: "alto",
    effort: "45m",
    note: "Aclara por que se redirige a login.",
  },
  {
    title: "Indicador visual de suma 100%",
    horizon: "quick",
    impact: "alto",
    effort: "30m",
    note: "Evita errores de configuracion de reportes.",
  },
  {
    title: "Health endpoint dependencias",
    horizon: "quick",
    impact: "alto",
    effort: "2h",
    note: "Implementado: detecta estado DB/Redis y marca degradado.",
  },
  {
    title: "Modulo de evidencia de impacto tesis",
    horizon: "quick",
    impact: "alto",
    effort: "1 dia",
    note: "Implementado: tiempos, kappa, encuesta Likert y analisis cualitativo inicial.",
  },
  {
    title: "Query optimizada en reportes",
    horizon: "sprint",
    impact: "alto",
    effort: "1 dia",
    note: "Reduce N+1 y mejora latencia en grupos grandes.",
  },
  {
    title: "Retries y fallback en Groq",
    horizon: "sprint",
    impact: "alto",
    effort: "1 dia",
    note: "Menos fallos por dependencia externa.",
  },
  {
    title: "Transacciones atomicas para boletines",
    horizon: "sprint",
    impact: "alto",
    effort: "1 dia",
    note: "Evita estados parciales en publicaciones.",
  },
  {
    title: "Logging estructurado JSON",
    horizon: "sprint",
    impact: "medio",
    effort: "1 dia",
    note: "Mejor trazabilidad y filtrado de incidentes.",
  },
  {
    title: "Limpieza automatica de uploads",
    horizon: "sprint",
    impact: "medio",
    effort: "1 dia",
    note: "Controla uso de disco y evita caidas por storage.",
  },
  {
    title: "Paginacion en listados admin/reportes",
    horizon: "future",
    impact: "medio",
    effort: "2 dias",
    note: "Escala mejor con volumen alto de usuarios.",
  },
  {
    title: "Observabilidad con metricas y dashboard",
    horizon: "future",
    impact: "medio",
    effort: "2-3 dias",
    note: "Latencias, errores y throughput por endpoint.",
  },
  {
    title: "Colaboracion en tiempo real para grupos",
    horizon: "future",
    impact: "medio",
    effort: "4-5 dias",
    note: "WebSocket para sincronizar respuestas grupales.",
  },
];

const remediationChecklist = [
  {
    title: "Health endpoint con DB/Redis",
    area: "backend",
    owner: "agente backend",
    status: "done",
    weakness: "No habia visibilidad real de dependencias en salud operativa.",
    fix: "GET /api/health ahora valida database + redis y responde degradado con HTTP 503.",
    evidence: ["backend/app/main.py", "backend/app/core/redis.py"],
    next: "Separar readiness y liveness para despliegues orquestados.",
  },
  {
    title: "Rate limiting resiliente sin Redis",
    area: "backend",
    owner: "agente backend",
    status: "done",
    weakness: "Si Redis caia, el rate limit quedaba en bypass total.",
    fix: "Middleware ahora usa fallback en memoria y marca modo activo en cabecera.",
    evidence: ["backend/app/core/rate_limiter.py"],
    next: "Unificar limite distribuido para multi-worker en fallback.",
  },
  {
    title: "Autosave de examen con restauracion",
    area: "frontend",
    owner: "agente frontend",
    status: "done",
    weakness: "Recargar pestaña podia borrar respuestas del estudiante.",
    fix: "ResolverExamen guarda borrador con debounce, restaura al entrar y limpia al enviar.",
    evidence: ["frontend/src/pages/estudiante/ResolverExamen.jsx"],
    next: "Sincronizar estados iniciales de todos los componentes interactivos.",
  },
  {
    title: "Limpieza de auth menos destructiva",
    area: "frontend",
    owner: "agente frontend",
    status: "done",
    weakness: "Un 401 podia borrar storage completo incluyendo datos utiles.",
    fix: "Interceptor limpia solo llaves de autenticacion y preserva datos no-auth.",
    evidence: ["frontend/src/api.js"],
    next: "Alinear logout manual para usar la misma estrategia de limpieza.",
  },
  {
    title: "Modulo de impacto de tesis",
    area: "backend/frontend",
    owner: "implementado",
    status: "done",
    weakness: "No habia instrumento integrado para medir eficiencia, concordancia y percepciones.",
    fix: "Se agrego router /api/tesis, tablas de evidencia y pantallas de tablero + encuesta.",
    evidence: [
      "backend/app/routers/tesis.py",
      "backend/app/models/models.py",
      "frontend/src/pages/profesor/ImpactoTesis.jsx",
      "frontend/src/pages/EncuestaImpacto.jsx",
    ],
    next: "Completar exportacion estadistica y pipeline inferencial formal.",
  },
  {
    title: "Encuesta Likert y analisis cualitativo",
    area: "backend/frontend",
    owner: "implementado",
    status: "done",
    weakness: "Faltaban variables de claridad, utilidad, pertinencia y comentarios de usuarios.",
    fix: "Se habilito captura Likert 1-5 con consentimiento y resumen cualitativo por temas.",
    evidence: ["backend/app/routers/tesis.py", "frontend/src/pages/EncuestaImpacto.jsx"],
    next: "Realizar analisis tematico manual con codificacion de categorias docentes.",
  },
  {
    title: "Retries y fallback en Groq",
    area: "backend",
    owner: "pendiente",
    status: "todo",
    weakness: "Timeouts o respuestas inconsistentes del LLM afectan generacion/calificacion.",
    fix: "Implementar retry exponencial y modelo alterno por tipo de tarea.",
    evidence: ["backend/app/services/groq_service.py"],
    next: "Definir politicas de reintento por endpoint para no duplicar costos.",
  },
  {
    title: "Transaccion atomica de boletines",
    area: "backend",
    owner: "pendiente",
    status: "todo",
    weakness: "Fallos intermedios pueden dejar boletines parciales.",
    fix: "Publicacion en transaccion unica por lote de materia/periodo.",
    evidence: ["backend/app/routers/reportes.py"],
    next: "Agregar rollback completo y log de lote fallido.",
  },
  {
    title: "Limpieza automatica de uploads OCR",
    area: "backend",
    owner: "pendiente",
    status: "todo",
    weakness: "Acumulacion de archivos puede degradar disco y rendimiento.",
    fix: "Job programado para borrar temporales por antiguedad.",
    evidence: ["backend/uploads", "backend/app/routers/grading.py"],
    next: "Definir politicas de retencion por tipo de evidencia.",
  },
  {
    title: "Paginacion de vistas pesadas",
    area: "frontend/backend",
    owner: "pendiente",
    status: "progress",
    weakness: "Tablas grandes de admin/reportes pueden crecer sin control.",
    fix: "Aplicar paginacion de API y controles en UI por materia/grado.",
    evidence: ["backend/app/routers/admin.py", "frontend/src/pages/admin"],
    next: "Medir tiempos con dataset grande para definir tamano de pagina.",
  },
];

const symptomMap = [
  {
    symptom: "Generar examen tarda demasiado",
    causes: [
      "latencia o cuota de Groq",
      "rate limit acumulado en Redis",
      "payload de prompt muy grande",
    ],
    checks: [
      "revisar logs backend en generation",
      "consultar api_usage_logs (tokens y errores)",
      "medir tiempo de /api/generate/exam",
    ],
    action: "activar retry+fallback y feedback de timeout en frontend",
  },
  {
    symptom: "Calificacion OCR falla intermitente",
    causes: ["paddleocr timeout", "archivo ilegible", "preproceso insuficiente"],
    checks: [
      "docker logs xcalificator_paddleocr",
      "ver texto_extraido en Nota",
      "validar tamano y extension del archivo",
    ],
    action: "agregar retries OCR y protocolo de revision manual",
  },
  {
    symptom: "Boletines no cuadran con notas esperadas",
    causes: [
      "porcentajes no suman 100",
      "actividad faltante se toma como 0.0",
      "participacion no registrada",
    ],
    checks: [
      "revisar config_porcentajes por materia/periodo",
      "consultar reporte por estudiante en endpoint",
      "comparar participacion/asistencia",
    ],
    action: "mostrar validador previo a generar/publicar boletines",
  },
  {
    symptom: "Usuario vuelve a login sin explicacion",
    causes: ["access token expirado", "refresh token invalido", "error de red"],
    checks: [
      "network tab en /api/auth/refresh",
      "estado localStorage access/refresh",
      "logs del interceptor Axios",
    ],
    action: "toast de sesion expirada y ruta de recuperacion",
  },
  {
    symptom: "Chat Xali responde 429 rapido",
    causes: ["limite de preguntas", "sesion vencida", "rate limit API"],
    checks: [
      "GET /api/chat/session/{nota_id}",
      "ver preguntas_usadas y cerrada",
      "revisar llaves rate_limit en Redis",
    ],
    action: "mostrar contador visible y boton para reiniciar sesion",
  },
  {
    symptom: "Admin dashboard lento",
    causes: ["consultas sin paginacion", "joins pesados", "sin cache"],
    checks: [
      "medir tiempos de /api/admin/stats y /users",
      "inspeccionar volumen de tablas users/audit_logs",
      "ver explain analyze de queries criticas",
    ],
    action: "paginacion + cache parcial de KPIs",
  },
];

const diagnosticCommands = [
  { title: "Salud de contenedores", cmd: "docker compose ps" },
  { title: "Errores backend", cmd: "docker logs xcalificator_backend --tail 120" },
  { title: "Errores OCR", cmd: "docker logs xcalificator_paddleocr --tail 120" },
  { title: "Estado Redis", cmd: "docker exec xcalificator_redis redis-cli ping" },
  {
    title: "Config porcentajes invalidas",
    cmd: "SELECT materia_id, periodo_id, SUM(porcentaje) FROM config_porcentajes GROUP BY materia_id, periodo_id HAVING SUM(porcentaje) <> 100;",
  },
  {
    title: "Usuarios sin notas",
    cmd: "SELECT m.estudiante_id FROM matriculas m LEFT JOIN notas n ON n.estudiante_id=m.estudiante_id WHERE n.id IS NULL;",
  },
];

const changeMap = [
  {
    feature: "Cambiar formula de nota final",
    summary: "Ajustar ponderacion, reglas de cap y tratamiento de faltantes.",
    backendFiles: [
      "backend/app/routers/reportes.py",
      "backend/app/schemas/schemas.py",
      "backend/app/models/models.py",
    ],
    frontendFiles: [
      "frontend/src/pages/profesor/MateriaReportes.jsx",
      "frontend/src/pages/estudiante/Boletin.jsx",
    ],
    checks: [
      "sumatoria porcentajes = 100",
      "comparar nota_final antes/despues con dataset control",
      "boletines existentes no se corrompen",
    ],
  },
  {
    feature: "Ajustar limites de Xali",
    summary: "Modificar max preguntas, tiempo de sesion o tono del tutor.",
    backendFiles: ["backend/app/routers/chat.py", "backend/app/services/groq_service.py"],
    frontendFiles: ["frontend/src/pages/estudiante/Chat.jsx"],
    checks: [
      "session status refleja nuevos limites",
      "429 aparece solo cuando corresponde",
      "historial no pierde mensajes",
    ],
  },
  {
    feature: "Agregar nuevo tipo de herramienta IA",
    summary: "Nuevo tipo en backend y render dedicado en frontend.",
    backendFiles: [
      "backend/app/routers/herramientas.py",
      "backend/app/services/groq_service.py",
      "backend/app/schemas/schemas.py",
    ],
    frontendFiles: [
      "frontend/src/pages/profesor/Herramientas.jsx",
      "frontend/src/pages/estudiante/ResolverExamen.jsx",
      "frontend/src/components/",
    ],
    checks: [
      "tipo nuevo aparece en selector",
      "contenido_json valida schema",
      "resolucion estudiante guarda respuesta",
    ],
  },
  {
    feature: "Reforzar OCR y calificacion",
    summary: "Mejorar precision OCR, reintentos y control de calidad.",
    backendFiles: [
      "backend/app/routers/grading.py",
      "backend/app/services/ocr_service.py",
      "backend/app/services/groq_service.py",
    ],
    frontendFiles: ["frontend/src/pages/profesor/Calificar.jsx"],
    checks: [
      "falla OCR devuelve error claro",
      "archivo se limpia despues de procesar",
      "detalle_json incluye trazabilidad",
    ],
  },
  {
    feature: "Cambiar politicas auth y CORS",
    summary: "Seguridad de token, origins y sesion.",
    backendFiles: [
      "backend/app/main.py",
      "backend/app/core/security.py",
      "backend/app/routers/auth.py",
    ],
    frontendFiles: ["frontend/src/api.js", "frontend/src/store.js"],
    checks: [
      "login+refresh funciona en deploy",
      "CORS bloquea dominios no autorizados",
      "logout limpia estado global",
    ],
  },
  {
    feature: "Optimizar reportes para alto volumen",
    summary: "Reducir N+1, agregar paginacion y cache selectiva.",
    backendFiles: ["backend/app/routers/reportes.py", "backend/app/core/redis.py"],
    frontendFiles: ["frontend/src/pages/profesor/MateriaReportes.jsx"],
    checks: [
      "tiempo de endpoint baja en dataset grande",
      "resultado final coincide con baseline",
      "memoria de contenedor estable",
    ],
  },
];

const architectureLanesBox = document.getElementById("architecture-lanes");
const criticalPathBox = document.getElementById("critical-path");
const kpiContainer = document.getElementById("overview-kpis");

const flowTabs = document.getElementById("flow-tabs");
const flowDetail = document.getElementById("flow-detail");
const roleTabs = document.getElementById("role-tabs");
const roleDetail = document.getElementById("role-detail");

const endpointSearch = document.getElementById("endpoint-search");
const routerGrid = document.getElementById("router-grid");
const entityGrid = document.getElementById("entity-grid");

const failureGrid = document.getElementById("failure-grid");
const severityFilter = document.getElementById("severity-filter");
const layerFilter = document.getElementById("layer-filter");
const improvementColumns = document.getElementById("improvement-columns");
const checklistSummary = document.getElementById("checklist-summary");
const checklistGrid = document.getElementById("checklist-grid");

const symptomSelect = document.getElementById("symptom-select");
const symptomResult = document.getElementById("symptom-result");
const diagnosticCommandsBox = document.getElementById("diagnostic-commands");

const changeGrid = document.getElementById("change-grid");

let activeFlow = 0;
let activeRole = 0;

const architectureById = Object.fromEntries(architectureNodes.map((node) => [node.id, node]));

function renderOverviewKpis() {
  kpiContainer.innerHTML = overviewKpis
    .map(
      (item) => `
        <article class="kpi-card">
          <h3>${item.value}</h3>
          <p>${item.label}</p>
        </article>
      `
    )
    .join("");
}

function getIncomingDependencies(nodeId) {
  return architectureEdges
    .filter(([, toId]) => toId === nodeId)
    .map(([fromId]) => architectureById[fromId]?.title || fromId);
}

function renderArchitectureMap() {
  if (architectureLanesBox) {
    architectureLanesBox.innerHTML = architectureLanes
      .map((lane) => {
        const cards = lane.nodes
          .map((nodeId) => {
            const node = architectureById[nodeId];
            if (!node) return "";
            const incoming = getIncomingDependencies(nodeId);
            const dependencyText = incoming.length
              ? incoming.join(" + ")
              : "entrada directa del usuario";
            const scaleHint =
              architectureScaleHints[nodeId] || "Definir SLO y alertas por latencia.";

            return `
              <article class="arch-card">
                <div class="arch-head">
                  <h3>${node.title}</h3>
                  <span class="badge ${node.status}">${node.status}</span>
                </div>
                <p>${node.info}</p>
                <p class="arch-meta"><strong>Depende de:</strong> ${dependencyText}</p>
                <p class="arch-meta"><strong>Escalar:</strong> ${scaleHint}</p>
              </article>
            `;
          })
          .join("");

        return `
          <section class="arch-lane">
            <header>
              <h3>${lane.title}</h3>
              <p>${lane.description}</p>
            </header>
            <div class="arch-grid">${cards}</div>
          </section>
        `;
      })
      .join("");
  }

  if (criticalPathBox) {
    const criticalNodes = criticalScalingPath
      .map((id) => architectureById[id])
      .filter(Boolean);

    criticalPathBox.innerHTML = `
      <p class="mono">ruta critica de escalado</p>
      <div class="critical-path-line">
        ${criticalNodes
          .map(
            (node, index) => `
              <span class="critical-node">${node.title}</span>
              ${index < criticalNodes.length - 1 ? '<span class="critical-arrow">-></span>' : ""}
            `
          )
          .join("")}
      </div>
      <p class="critical-note">
        Si este camino mantiene buena latencia y estabilidad, el sistema soporta mejor el crecimiento.
      </p>
    `;
  }
}

function renderFlowTabs() {
  flowTabs.innerHTML = "";

  flows.forEach((flow, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = flow.title;
    btn.classList.toggle("active", idx === activeFlow);
    btn.addEventListener("click", () => {
      activeFlow = idx;
      renderFlowTabs();
      renderFlowDetail();
    });
    flowTabs.appendChild(btn);
  });
}

function renderFlowDetail() {
  const flow = flows[activeFlow];
  const steps = flow.steps
    .map(
      (step, idx) => `
        <div class="step">
          <h4>Paso ${idx + 1}</h4>
          <p>${step}</p>
        </div>
      `
    )
    .join("");

  const hotspots = flow.hotspots.map((item) => `<div class="hotspot">${item}</div>`).join("");

  flowDetail.innerHTML = `
    <div class="flow-card">
      <h3>${flow.title}</h3>
      <p>${flow.summary}</p>
    </div>
    <div class="flow-steps">${steps}</div>
    <div class="flow-card">
      <h3>Hotspots de fallo</h3>
      <div class="hotspot-list">${hotspots}</div>
    </div>
  `;
}

function renderRoleTabs() {
  roleTabs.innerHTML = "";

  roleJourneys.forEach((role, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = role.title;
    btn.classList.toggle("active", idx === activeRole);
    btn.addEventListener("click", () => {
      activeRole = idx;
      renderRoleTabs();
      renderRoleDetail();
    });
    roleTabs.appendChild(btn);
  });
}

function renderRoleDetail() {
  const role = roleJourneys[activeRole];
  const screens = role.screens.map((screen) => `<div class="hotspot">${screen}</div>`).join("");
  const path = role.path.map((item) => `<div class="step"><p>${item}</p></div>`).join("");
  const risks = role.risks.map((item) => `<div class="hotspot">${item}</div>`).join("");

  roleDetail.innerHTML = `
    <div class="flow-card">
      <h3>${role.title}</h3>
      <p>${role.summary}</p>
    </div>
    <div class="flow-card">
      <h3>Pantallas principales</h3>
      <div class="hotspot-list">${screens}</div>
    </div>
    <div class="flow-steps">${path}</div>
    <div class="flow-card">
      <h3>Riesgos operativos de este rol</h3>
      <div class="hotspot-list">${risks}</div>
    </div>
  `;
}

function renderRouterMap(searchTerm = "") {
  const term = searchTerm.trim().toLowerCase();
  const filtered = routerMap.filter((router) => {
    if (!term) return true;
    const haystack = [
      router.router,
      router.prefix,
      router.purpose,
      ...router.endpoints,
      ...router.dependencies,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  if (!filtered.length) {
    routerGrid.innerHTML = '<div class="empty-state">No hay coincidencias para esa busqueda.</div>';
    return;
  }

  routerGrid.innerHTML = filtered
    .map(
      (router) => `
        <article class="router-card">
          <h3>${router.router} <span class="mono">${router.prefix}</span></h3>
          <p>${router.purpose}</p>
          <ul class="route-list">
            ${router.endpoints.map((ep) => `<li>${ep}</li>`).join("")}
          </ul>
          <div class="tag-list">
            ${router.dependencies.map((dep) => `<span>${dep}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderEntities() {
  entityGrid.innerHTML = entities
    .map(
      (entity) => `
        <article class="entity-card">
          <h3>${entity.name}</h3>
          <p><strong>Tabla:</strong> ${entity.table}</p>
          <p>${entity.purpose}</p>
          <div class="tag-list">
            <span>write: ${entity.writesBy.join("/")}</span>
            <span>read: ${entity.readBy.join("/")}</span>
          </div>
          <p><strong>Riesgo:</strong> ${entity.risk}</p>
        </article>
      `
    )
    .join("");
}

function renderFailures() {
  const severity = severityFilter.value;
  const layer = layerFilter.value;

  const filtered = failures.filter((item) => {
    const severityMatch = severity === "all" || item.severity === severity;
    const layerMatch = layer === "all" || item.layer === layer;
    return severityMatch && layerMatch;
  });

  if (!filtered.length) {
    failureGrid.innerHTML = '<div class="empty-state">No hay fallos para ese filtro.</div>';
    return;
  }

  failureGrid.innerHTML = filtered
    .map(
      (item) => `
        <article class="failure-card" data-severity="${item.severity}">
          <h3>${item.title}</h3>
          <p><strong>Trigger:</strong> ${item.trigger}</p>
          <p><strong>Sintoma:</strong> ${item.symptom}</p>
          <p><strong>Observar:</strong> ${item.observe}</p>
          <p><strong>Mitigar:</strong> ${item.fix}</p>
          <div class="failure-meta">
            <span>${item.layer}</span>
            <span>${item.severity}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderImprovements() {
  const groups = {
    quick: {
      title: "Quick wins (1 dia)",
      items: improvements.filter((item) => item.horizon === "quick"),
    },
    sprint: {
      title: "Sprint siguiente",
      items: improvements.filter((item) => item.horizon === "sprint"),
    },
    future: {
      title: "Mediano plazo",
      items: improvements.filter((item) => item.horizon === "future"),
    },
  };

  improvementColumns.innerHTML = Object.values(groups)
    .map(
      (group) => `
        <section class="column">
          <h3>${group.title}</h3>
          <div class="card-list">
            ${group.items
              .map(
                (item) => `
                  <article class="improve-card">
                    <h4>${item.title}</h4>
                    <p>${item.note}</p>
                    <div class="meta-row">
                      <span>impacto: ${item.impact}</span>
                      <span>esfuerzo: ${item.effort}</span>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function getChecklistStatusLabel(status) {
  if (status === "done") return "resuelto";
  if (status === "progress") return "en curso";
  return "pendiente";
}

function renderChecklist() {
  const total = remediationChecklist.length;
  const done = remediationChecklist.filter((item) => item.status === "done").length;
  const progress = remediationChecklist.filter((item) => item.status === "progress").length;
  const todo = remediationChecklist.filter((item) => item.status === "todo").length;

  if (checklistSummary) {
    checklistSummary.innerHTML = `
      <span class="summary-pill">total: ${total}</span>
      <span class="summary-pill done">resueltos: ${done}</span>
      <span class="summary-pill progress">en curso: ${progress}</span>
      <span class="summary-pill todo">pendientes: ${todo}</span>
    `;
  }

  if (checklistGrid) {
    checklistGrid.innerHTML = remediationChecklist
      .map(
        (item) => `
          <article class="checklist-card">
            <div class="checklist-head">
              <h3>${item.title}</h3>
              <span class="status-chip ${item.status}">${getChecklistStatusLabel(item.status)}</span>
            </div>
            <div class="checklist-meta">
              <span>area: ${item.area}</span>
              <span>owner: ${item.owner}</span>
            </div>
            <ul class="checklist-list">
              <li><strong>Debilidad:</strong> ${item.weakness}</li>
              <li><strong>Accion:</strong> ${item.fix}</li>
              <li><strong>Evidencia:</strong> ${item.evidence.join(" | ")}</li>
              <li><strong>Siguiente:</strong> ${item.next}</li>
            </ul>
          </article>
        `
      )
      .join("");
  }
}

function renderSymptomSelect() {
  symptomSelect.innerHTML = symptomMap
    .map((item, idx) => `<option value="${idx}">${item.symptom}</option>`)
    .join("");
}

function renderSymptomResult(index) {
  const selected = symptomMap[index] || symptomMap[0];

  const causeList = selected.causes.map((cause) => `<li>${cause}</li>`).join("");
  const checkList = selected.checks.map((check) => `<li>${check}</li>`).join("");

  symptomResult.innerHTML = `
    <h3>${selected.symptom}</h3>
    <p><strong>Causas probables</strong></p>
    <ul class="symptom-list">${causeList}</ul>
    <p><strong>Checks recomendados</strong></p>
    <ul class="symptom-list">${checkList}</ul>
    <p><strong>Accion rapida:</strong> ${selected.action}</p>
  `;
}

function renderDiagnosticCommands() {
  diagnosticCommandsBox.innerHTML = diagnosticCommands
    .map(
      (item) => `
        <article class="command-card">
          <h4>${item.title}</h4>
          <div class="command-box">${item.cmd}</div>
        </article>
      `
    )
    .join("");
}

function renderChangeMap() {
  changeGrid.innerHTML = changeMap
    .map(
      (item) => `
        <article class="change-card">
          <h3>${item.feature}</h3>
          <p>${item.summary}</p>
          <div class="change-columns">
            <div class="change-col">
              <h4>Backend</h4>
              <ul>
                ${item.backendFiles.map((file) => `<li>${file}</li>`).join("")}
              </ul>
            </div>
            <div class="change-col">
              <h4>Frontend</h4>
              <ul>
                ${item.frontendFiles.map((file) => `<li>${file}</li>`).join("")}
              </ul>
            </div>
            <div class="change-col">
              <h4>Validar</h4>
              <ul>
                ${item.checks.map((check) => `<li>${check}</li>`).join("")}
              </ul>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function wireFilters() {
  severityFilter.addEventListener("change", renderFailures);
  layerFilter.addEventListener("change", renderFailures);
  symptomSelect.addEventListener("change", (event) => {
    renderSymptomResult(Number(event.target.value));
  });

  endpointSearch.addEventListener("input", (event) => {
    renderRouterMap(event.target.value);
  });
}

function wireSectionNav() {
  const buttons = Array.from(document.querySelectorAll(".quick-nav button"));
  const sections = buttons.map((btn) => document.getElementById(btn.dataset.target)).filter(Boolean);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const currentId = entry.target.id;
        buttons.forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.target === currentId);
        });
      });
    },
    { threshold: 0.35 }
  );

  sections.forEach((section) => navObserver.observe(section));
}

function wireRevealAnimation() {
  const revealItems = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function init() {
  renderOverviewKpis();
  renderArchitectureMap();

  renderFlowTabs();
  renderFlowDetail();

  renderRoleTabs();
  renderRoleDetail();

  renderRouterMap();
  renderEntities();

  renderFailures();
  renderImprovements();
  renderChecklist();

  renderSymptomSelect();
  renderSymptomResult(0);
  renderDiagnosticCommands();

  renderChangeMap();

  wireFilters();
  wireSectionNav();
  wireRevealAnimation();
}

init();
