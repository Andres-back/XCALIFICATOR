BEGIN;

CREATE TABLE IF NOT EXISTS materia_encuentros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id UUID REFERENCES materias(id) ON DELETE CASCADE,
  dia_semana VARCHAR(10) NOT NULL,
  hora_inicio VARCHAR(5) NOT NULL,
  hora_fin VARCHAR(5) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_materia_encuentros_materia_dia
  ON materia_encuentros(materia_id, dia_semana);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_materia_encuentros_dia_semana'
      AND conrelid = 'materia_encuentros'::regclass
  ) THEN
    ALTER TABLE materia_encuentros
      ADD CONSTRAINT ck_materia_encuentros_dia_semana
      CHECK (dia_semana IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'));
  END IF;
END
$$;

COMMIT;
