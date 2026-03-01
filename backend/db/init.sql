-- =============================================
-- XCalificator - Schema completo PostgreSQL
-- =============================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USUARIOS Y AUTENTICACIÓN
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       VARCHAR(100) NOT NULL,
  apellido     VARCHAR(100) NOT NULL,
  documento    VARCHAR(50) UNIQUE NOT NULL,
  correo       VARCHAR(255) UNIQUE NOT NULL,
  celular      VARCHAR(20),
  password_hash TEXT,
  google_id    VARCHAR(255) UNIQUE,
  rol          VARCHAR(20) NOT NULL DEFAULT 'estudiante',
  grado        VARCHAR(30),
  activo       BOOLEAN DEFAULT TRUE,
  correo_verificado BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sesiones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  ip          INET,
  dispositivo TEXT,
  fecha_inicio TIMESTAMPTZ DEFAULT NOW(),
  fecha_fin   TIMESTAMPTZ
);

-- MATERIAS Y MATRÍCULAS
CREATE TABLE materias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     VARCHAR(200) NOT NULL,
  codigo     VARCHAR(20) UNIQUE NOT NULL,
  profesor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE matriculas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id UUID REFERENCES users(id) ON DELETE CASCADE,
  materia_id    UUID REFERENCES materias(id) ON DELETE CASCADE,
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(estudiante_id, materia_id)
);

-- EXÁMENES Y NOTAS
CREATE TABLE examenes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id       UUID REFERENCES materias(id) ON DELETE CASCADE,
  titulo           VARCHAR(300) NOT NULL,
  tipo             VARCHAR(50),
  contenido_json   JSONB,
  clave_respuestas JSONB,
  activo_online    BOOLEAN DEFAULT FALSE,
  fecha_limite     TIMESTAMPTZ,
  fecha_activacion TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  examen_id             UUID REFERENCES examenes(id) ON DELETE CASCADE,
  nota                  DECIMAL(4,2),
  detalle_json          JSONB,
  retroalimentacion     TEXT,
  imagen_procesada_url  TEXT,
  texto_extraido        TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICACIONES
CREATE TABLE preferencias_notif (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  acepta_email    BOOLEAN DEFAULT TRUE,
  acepta_whatsapp BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notificaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  tipo        VARCHAR(100),
  canal       VARCHAR(20),
  mensaje     TEXT,
  enviado     BOOLEAN DEFAULT FALSE,
  fecha_envio TIMESTAMPTZ
);

-- RESPUESTAS ONLINE DE ESTUDIANTES
CREATE TABLE respuestas_online (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  examen_id       UUID REFERENCES examenes(id) ON DELETE CASCADE,
  respuestas_json JSONB,
  enviado_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(estudiante_id, examen_id)
);

-- AUDIT LOG
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  accion      VARCHAR(200) NOT NULL,
  detalle     JSONB,
  ip          INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT HISTORY (persistent chatbot conversations)
CREATE TABLE chat_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id    UUID REFERENCES notas(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_chat_history_nota ON chat_history(nota_id, created_at);

-- API USAGE LOG (Groq API tracking)
CREATE TABLE api_usage_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model             VARCHAR(100) NOT NULL,
  task              VARCHAR(50) NOT NULL,
  prompt_tokens     NUMERIC DEFAULT 0,
  completion_tokens NUMERIC DEFAULT 0,
  total_tokens      NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_api_usage_created ON api_usage_log(created_at);

-- PERÍODOS ACADÉMICOS
CREATE TABLE periodos_academicos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(100) NOT NULL,
  numero      INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 4),
  fecha_inicio DATE NOT NULL,
  fecha_fin   DATE NOT NULL,
  porcentaje  DECIMAL(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(numero)
);

-- HERRAMIENTAS (independientes, antes de asignar a materia)
CREATE TABLE herramientas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  tipo             VARCHAR(50) NOT NULL, -- 'examen', 'crucigrama', 'sopa_letras'
  titulo           VARCHAR(300) NOT NULL,
  contenido_json   JSONB,
  clave_respuestas JSONB,
  config_json      JSONB,                -- opciones de configuración
  estado           VARCHAR(20) DEFAULT 'borrador', -- 'borrador', 'listo', 'asignado'
  materia_id       UUID REFERENCES materias(id) ON DELETE SET NULL, -- null hasta asignar
  examen_id        UUID REFERENCES examenes(id) ON DELETE SET NULL, -- ID del examen creado al asignar
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ASISTENCIA
CREATE TABLE asistencia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id    UUID REFERENCES materias(id) ON DELETE CASCADE,
  estudiante_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL,
  estado        VARCHAR(20) NOT NULL DEFAULT 'presente', -- 'presente', 'ausente', 'tardanza', 'justificado'
  observacion   TEXT,
  registrado_por UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(materia_id, estudiante_id, fecha)
);

-- CONFIGURACIÓN DE PORCENTAJES POR ACTIVIDAD (por materia y período)
CREATE TABLE config_porcentajes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id    UUID REFERENCES materias(id) ON DELETE CASCADE,
  periodo_id    UUID REFERENCES periodos_academicos(id) ON DELETE CASCADE,
  examen_id     UUID REFERENCES examenes(id) ON DELETE CASCADE,
  tipo_actividad VARCHAR(50),
  porcentaje    DECIMAL(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_config_examen ON config_porcentajes (materia_id, periodo_id, examen_id) WHERE examen_id IS NOT NULL;
CREATE UNIQUE INDEX uq_config_tipo ON config_porcentajes (materia_id, periodo_id, tipo_actividad) WHERE tipo_actividad IS NOT NULL;

-- PARTICIPACIÓN
CREATE TABLE notas_participacion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id    UUID REFERENCES materias(id) ON DELETE CASCADE,
  periodo_id    UUID REFERENCES periodos_academicos(id) ON DELETE CASCADE,
  estudiante_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nota          DECIMAL(4,2) NOT NULL DEFAULT 0,
  observacion   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(materia_id, periodo_id, estudiante_id)
);

-- BOLETINES
CREATE TABLE boletines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id UUID REFERENCES users(id) ON DELETE CASCADE,
  materia_id    UUID REFERENCES materias(id) ON DELETE CASCADE,
  periodo_id    UUID REFERENCES periodos_academicos(id) ON DELETE CASCADE,
  nota_final    DECIMAL(4,2),
  desglose_json JSONB,  -- detalle de cada actividad con su nota y porcentaje
  publicado     BOOLEAN DEFAULT FALSE,
  publicado_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL, -- profesor que lo generó
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(estudiante_id, materia_id, periodo_id)
);

-- GRUPOS PARA ACTIVIDADES
CREATE TABLE grupos_actividad (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examen_id   UUID REFERENCES examenes(id) ON DELETE CASCADE,
  nombre      VARCHAR(100),
  creador_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE miembros_grupo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id       UUID REFERENCES grupos_actividad(id) ON DELETE CASCADE,
  estudiante_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  es_lider       BOOLEAN DEFAULT FALSE,
  aceptado       BOOLEAN DEFAULT TRUE,
  joined_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grupo_id, estudiante_id)
);

-- CHAT XALI SESSIONS (para controlar límites por actividad)
CREATE TABLE chat_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudiante_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  nota_id          UUID REFERENCES notas(id) ON DELETE CASCADE,
  cerrada          BOOLEAN DEFAULT FALSE,
  preguntas_usadas INTEGER DEFAULT 0,
  inicio           TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar campo grupo_id y modo_grupal a examenes
ALTER TABLE examenes ADD COLUMN modo_grupal BOOLEAN DEFAULT FALSE;
ALTER TABLE examenes ADD COLUMN max_integrantes INTEGER DEFAULT 3;

-- Índices de rendimiento
CREATE INDEX idx_sesiones_user ON sesiones(user_id);
CREATE INDEX idx_matriculas_estudiante ON matriculas(estudiante_id);
CREATE INDEX idx_matriculas_materia ON matriculas(materia_id);
CREATE INDEX idx_examenes_materia ON examenes(materia_id);
CREATE INDEX idx_notas_estudiante ON notas(estudiante_id);
CREATE INDEX idx_notas_examen ON notas(examen_id);
CREATE INDEX idx_notificaciones_user ON notificaciones(user_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_herramientas_profesor ON herramientas(profesor_id);
CREATE INDEX idx_herramientas_estado ON herramientas(estado);
CREATE INDEX idx_asistencia_materia ON asistencia(materia_id, fecha);
CREATE INDEX idx_asistencia_estudiante ON asistencia(estudiante_id);
CREATE INDEX idx_boletines_estudiante ON boletines(estudiante_id);
CREATE INDEX idx_boletines_materia_periodo ON boletines(materia_id, periodo_id);
CREATE INDEX idx_chat_sessions_estudiante_nota ON chat_sessions(estudiante_id, nota_id);

-- Crear usuario admin por defecto (password: Admin123!)
INSERT INTO users (nombre, apellido, documento, correo, password_hash, rol)
VALUES (
  'Admin',
  'Sistema',
  '00000000',
  'admin@xcalificator.com',
  '$2b$12$P3QJbu.k5O0cU.n45QKS5e7OSRfqFOQXd/hRoc05UZvoPbgGIXWaq',
  'admin'
);
