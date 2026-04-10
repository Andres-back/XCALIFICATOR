-- Migration: tesis impact instrumentation (idempotent)
-- Creates evidence tables for time metrics and Likert/qualitative surveys.

CREATE TABLE IF NOT EXISTS tiempos_evaluacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  materia_id UUID REFERENCES materias(id) ON DELETE SET NULL,
  examen_id UUID REFERENCES examenes(id) ON DELETE SET NULL,
  fase VARCHAR(20) NOT NULL CHECK (fase IN ('sin_sistema', 'con_sistema')),
  actividad_tipo VARCHAR(50) NOT NULL DEFAULT 'examen',
  grupo_pareado VARCHAR(120),
  duracion_minutos DECIMAL(8,2) NOT NULL CHECK (duracion_minutos > 0),
  estudiantes_evaluados INTEGER NOT NULL DEFAULT 1 CHECK (estudiantes_evaluados > 0),
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encuestas_impacto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rol VARCHAR(20) NOT NULL,
  hito VARCHAR(50) NOT NULL DEFAULT 'post_uso',
  claridad INTEGER NOT NULL CHECK (claridad BETWEEN 1 AND 5),
  utilidad INTEGER NOT NULL CHECK (utilidad BETWEEN 1 AND 5),
  pertinencia INTEGER NOT NULL CHECK (pertinencia BETWEEN 1 AND 5),
  satisfaccion INTEGER CHECK (satisfaccion BETWEEN 1 AND 5),
  facilidad_uso INTEGER CHECK (facilidad_uso BETWEEN 1 AND 5),
  comentario TEXT,
  consentimiento BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiempos_eval_profesor
  ON tiempos_evaluacion(profesor_id, fase);

CREATE INDEX IF NOT EXISTS idx_tiempos_eval_materia
  ON tiempos_evaluacion(materia_id, actividad_tipo);

CREATE INDEX IF NOT EXISTS idx_encuestas_hito_rol
  ON encuestas_impacto(hito, rol);
