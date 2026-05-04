BEGIN;

-- Keep the most recent nota per (estudiante_id, examen_id), remove older duplicates.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY estudiante_id, examen_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM notas
)
DELETE FROM notas n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_notas_estudiante_examen'
      AND conrelid = 'notas'::regclass
  ) THEN
    ALTER TABLE notas
      ADD CONSTRAINT uq_notas_estudiante_examen
      UNIQUE (estudiante_id, examen_id);
  END IF;
END
$$;

COMMIT;
