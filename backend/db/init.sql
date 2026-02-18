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

-- Índices de rendimiento
CREATE INDEX idx_sesiones_user ON sesiones(user_id);
CREATE INDEX idx_matriculas_estudiante ON matriculas(estudiante_id);
CREATE INDEX idx_matriculas_materia ON matriculas(materia_id);
CREATE INDEX idx_examenes_materia ON examenes(materia_id);
CREATE INDEX idx_notas_estudiante ON notas(estudiante_id);
CREATE INDEX idx_notas_examen ON notas(examen_id);
CREATE INDEX idx_notificaciones_user ON notificaciones(user_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);

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
