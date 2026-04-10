-- Seed realista y amplio para pruebas funcionales (profesor/admin/estudiante).
-- Uso:
--   docker exec -i xcalificator_postgres psql -U xcalificator -d xcalificator_db < backend/db/seeds/seed_boletin_stats.sql

BEGIN;

-- 1) Limpieza operativa
TRUNCATE TABLE
  encuestas_impacto,
  tiempos_evaluacion,
  chat_history,
  chat_sessions,
  miembros_grupo,
  grupos_actividad,
  boletines,
  config_porcentajes,
  notas_participacion,
  asistencia,
  respuestas_online,
  notas,
  examenes,
  matriculas,
  herramientas,
  notificaciones,
  preferencias_notif,
  api_usage_log,
  audit_log,
  sesiones,
  materias
RESTART IDENTITY CASCADE;

TRUNCATE TABLE periodos_academicos RESTART IDENTITY CASCADE;

DELETE FROM users
WHERE correo <> 'admin@xcalificator.com';

-- 2) Admin base (idempotente)
INSERT INTO users (
  nombre,
  apellido,
  documento,
  correo,
  celular,
  password_hash,
  rol,
  grado,
  activo,
  correo_verificado
)
VALUES (
  'Admin',
  'Sistema',
  '00000000',
  'admin@xcalificator.com',
  '3000000000',
  '$2b$12$P3QJbu.k5O0cU.n45QKS5e7OSRfqFOQXd/hRoc05UZvoPbgGIXWaq',
  'admin',
  NULL,
  TRUE,
  TRUE
)
ON CONFLICT (correo)
DO UPDATE SET
  nombre = EXCLUDED.nombre,
  apellido = EXCLUDED.apellido,
  documento = EXCLUDED.documento,
  celular = EXCLUDED.celular,
  activo = TRUE,
  correo_verificado = TRUE;

-- 3) Profesores (6)
INSERT INTO users (
  nombre,
  apellido,
  documento,
  correo,
  celular,
  password_hash,
  rol,
  grado,
  activo,
  correo_verificado
)
SELECT
  'Profesor ' || gs.i,
  (ARRAY['Ramirez', 'Castro', 'Lopez', 'Garcia', 'Perez', 'Moreno'])[gs.i],
  '210' || lpad(gs.i::text, 5, '0'),
  'profesor' || gs.i || '@xcalificator-demo.com',
  '3109' || lpad((1000 + gs.i)::text, 6, '0'),
  '$2b$12$P3QJbu.k5O0cU.n45QKS5e7OSRfqFOQXd/hRoc05UZvoPbgGIXWaq',
  'profesor',
  NULL,
  TRUE,
  TRUE
FROM generate_series(1, 6) AS gs(i);

-- 4) Estudiantes (72: 24 por grado 6,7,8)
WITH nombres AS (
  SELECT
    ARRAY['Ana', 'Luis', 'Maria', 'Carlos', 'Sofia', 'Juan', 'Daniela', 'Mateo', 'Valentina', 'Andres', 'Paula', 'Miguel'] AS n,
    ARRAY['Gomez', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Garcia', 'Ruiz', 'Moreno', 'Castro', 'Torres', 'Rojas', 'Vargas'] AS a
)
INSERT INTO users (
  nombre,
  apellido,
  documento,
  correo,
  celular,
  password_hash,
  rol,
  grado,
  activo,
  correo_verificado
)
SELECT
  (n.n)[1 + ((gs.i - 1) % array_length(n.n, 1))],
  (n.a)[1 + ((gs.i - 1) % array_length(n.a, 1))],
  '30' || lpad(gs.i::text, 6, '0'),
  'estudiante' || lpad(gs.i::text, 3, '0') || '@xcalificator-demo.com',
  CASE WHEN random() < 0.15 THEN NULL ELSE '32' || lpad((10000000 + gs.i)::text, 8, '0') END,
  '$2b$12$P3QJbu.k5O0cU.n45QKS5e7OSRfqFOQXd/hRoc05UZvoPbgGIXWaq',
  'estudiante',
  CASE
    WHEN gs.i <= 24 THEN '6'
    WHEN gs.i <= 48 THEN '7'
    ELSE '8'
  END,
  TRUE,
  TRUE
FROM generate_series(1, 72) AS gs(i)
CROSS JOIN nombres n;

-- 5) Preferencias de notificacion (variacion real)
INSERT INTO preferencias_notif (user_id, acepta_email, acepta_whatsapp, updated_at)
SELECT
  u.id,
  CASE WHEN u.rol = 'estudiante' THEN random() > 0.08 ELSE TRUE END,
  CASE WHEN u.rol = 'estudiante' THEN random() < 0.35 ELSE TRUE END,
  now() - (random() * 40 || ' days')::interval
FROM users u;

-- 6) Periodos academicos
INSERT INTO periodos_academicos (
  nombre,
  numero,
  fecha_inicio,
  fecha_fin,
  porcentaje,
  activo
)
VALUES
  ('Periodo 1 - 2026', 1, DATE '2026-01-20', DATE '2026-03-31', 25.00, TRUE),
  ('Periodo 2 - 2026', 2, DATE '2026-04-01', DATE '2026-06-15', 25.00, TRUE),
  ('Periodo 3 - 2026', 3, DATE '2026-06-16', DATE '2026-08-31', 25.00, FALSE),
  ('Periodo 4 - 2026', 4, DATE '2026-09-01', DATE '2026-11-30', 25.00, FALSE);

-- 7) Materias (4 por grado: 12 total)
WITH materias_base AS (
  SELECT *
  FROM (VALUES
    (1, 'Matematicas', '6'),
    (2, 'Ciencias', '6'),
    (3, 'Lenguaje', '6'),
    (4, 'Sociales', '6'),
    (5, 'Matematicas', '7'),
    (6, 'Ciencias', '7'),
    (7, 'Lenguaje', '7'),
    (8, 'Sociales', '7'),
    (9, 'Matematicas', '8'),
    (10, 'Ciencias', '8'),
    (11, 'Lenguaje', '8'),
    (12, 'Sociales', '8')
  ) AS t(ord, asignatura, grado)
),
profes AS (
  SELECT id, row_number() OVER (ORDER BY correo) AS rn
  FROM users
  WHERE rol = 'profesor'
)
INSERT INTO materias (nombre, codigo, profesor_id)
SELECT
  mb.asignatura || ' ' || mb.grado,
  upper(left(mb.asignatura, 3)) || mb.grado || '-' || lpad(mb.ord::text, 2, '0'),
  p.id
FROM materias_base mb
JOIN profes p
  ON p.rn = ((mb.ord - 1) % 6) + 1;

-- 8) Matriculas: cada estudiante en las 4 materias de su grado
INSERT INTO matriculas (estudiante_id, materia_id)
SELECT
  u.id,
  m.id
FROM users u
JOIN materias m
  ON m.nombre LIKE ('% ' || u.grado)
WHERE u.rol = 'estudiante';

-- 9) Perfil academico de estudiantes (alto/medio/bajo)
CREATE TEMP TABLE tmp_student_profile AS
SELECT
  s.id AS estudiante_id,
  CASE
    WHEN s.bucket <= 2 THEN 'alto'
    WHEN s.bucket <= 8 THEN 'medio'
    ELSE 'bajo'
  END AS perfil,
  CASE
    WHEN s.bucket <= 2 THEN 4.35 + random() * 0.45
    WHEN s.bucket <= 8 THEN 3.10 + random() * 0.95
    ELSE 2.00 + random() * 0.75
  END AS base_nota,
  CASE
    WHEN s.bucket <= 2 THEN 0.04 + random() * 0.04
    WHEN s.bucket <= 8 THEN 0.10 + random() * 0.08
    ELSE 0.20 + random() * 0.12
  END AS riesgo_ausencia
FROM (
  SELECT id, ntile(10) OVER (ORDER BY random()) AS bucket
  FROM users
  WHERE rol = 'estudiante'
) s;

-- 10) Examenes por materia y periodo (3 por periodo, periodos 1 y 2)
WITH periodos_seed AS (
  SELECT id, numero, fecha_inicio
  FROM periodos_academicos
  WHERE numero IN (1, 2)
),
seq AS (
  SELECT generate_series(1, 3) AS n
)
INSERT INTO examenes (
  materia_id,
  titulo,
  tipo,
  contenido_json,
  clave_respuestas,
  activo_online,
  fecha_limite,
  fecha_activacion,
  created_at
)
SELECT
  m.id,
  m.nombre || ' - P' || p.numero || ' - ' ||
    CASE s.n
      WHEN 1 THEN 'Quiz Diagnostico'
      WHEN 2 THEN 'Parcial Aplicado'
      ELSE 'Proyecto Grupal'
    END,
  CASE s.n
    WHEN 1 THEN 'quiz'
    WHEN 2 THEN 'parcial'
    ELSE 'proyecto_grupal'
  END,
  jsonb_build_object(
    'preguntas',
    jsonb_build_array(
      jsonb_build_object('numero', 1, 'pregunta', 'Concepto clave de ' || m.nombre || ' (P' || p.numero || ')', 'tipo', 'seleccion_multiple', 'opciones', jsonb_build_array('A', 'B', 'C', 'D')),
      jsonb_build_object('numero', 2, 'pregunta', 'Afirmacion para validar en ' || m.nombre, 'tipo', 'verdadero_falso', 'opciones', jsonb_build_array('Verdadero', 'Falso')),
      jsonb_build_object('numero', 3, 'pregunta', 'Aplicacion contextual de ' || m.nombre, 'tipo', 'seleccion_multiple', 'opciones', jsonb_build_array('A', 'B', 'C', 'D')),
      jsonb_build_object('numero', 4, 'pregunta', 'Explica tu razonamiento en un caso practico', 'tipo', 'abierta')
    )
  ),
  jsonb_build_object(
    'preguntas',
    jsonb_build_array(
      jsonb_build_object('numero', 1, 'respuesta_correcta', 'A', 'puntos', 1.5),
      jsonb_build_object('numero', 2, 'respuesta_correcta', 'Verdadero', 'puntos', 1.0),
      jsonb_build_object('numero', 3, 'respuesta_correcta', 'C', 'puntos', 1.5),
      jsonb_build_object('numero', 4, 'respuesta_correcta', 'Respuesta argumentada con conceptos del tema', 'puntos', 1.0)
    )
  ),
  CASE WHEN s.n IN (1, 2) THEN TRUE ELSE (random() < 0.35) END,
  (p.fecha_inicio::timestamp + ((s.n * 18) + floor(random() * 4) + 5) * interval '1 day')::timestamptz,
  (p.fecha_inicio::timestamp + ((s.n * 18) + floor(random() * 4)) * interval '1 day')::timestamptz,
  (p.fecha_inicio::timestamp + ((s.n * 18) + floor(random() * 4)) * interval '1 day')::timestamptz
FROM materias m
CROSS JOIN periodos_seed p
CROSS JOIN seq s;

-- 11) Marcar exámenes grupales si existen columnas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'examenes' AND column_name = 'modo_grupal'
  ) THEN
    UPDATE examenes
    SET
      modo_grupal = (tipo = 'proyecto_grupal'),
      max_integrantes = CASE WHEN tipo = 'proyecto_grupal' THEN 4 ELSE COALESCE(max_integrantes, 3) END;
  END IF;
END $$;

-- 12) Grupos y miembros para examenes grupales
INSERT INTO grupos_actividad (examen_id, nombre, creador_id)
SELECT
  e.id,
  'Grupo ' || gs.n || ' - ' || e.titulo,
  m.profesor_id
FROM examenes e
JOIN materias m ON m.id = e.materia_id
CROSS JOIN generate_series(1, 4) AS gs(n)
WHERE e.tipo = 'proyecto_grupal';

CREATE TEMP TABLE tmp_group_assignment AS
WITH students AS (
  SELECT
    e.id AS examen_id,
    ma.estudiante_id,
    row_number() OVER (PARTITION BY e.id ORDER BY random()) AS rn
  FROM examenes e
  JOIN matriculas ma ON ma.materia_id = e.materia_id
  WHERE e.tipo = 'proyecto_grupal'
),
groups AS (
  SELECT
    g.id AS grupo_id,
    g.examen_id,
    row_number() OVER (PARTITION BY g.examen_id ORDER BY g.id) AS grp
  FROM grupos_actividad g
)
SELECT
  gr.grupo_id,
  st.estudiante_id,
  row_number() OVER (PARTITION BY gr.grupo_id ORDER BY st.rn) AS pos_in_group
FROM students st
JOIN groups gr
  ON gr.examen_id = st.examen_id
 AND gr.grp = ((st.rn - 1) % 4) + 1;

INSERT INTO miembros_grupo (grupo_id, estudiante_id, es_lider, aceptado)
SELECT
  tga.grupo_id,
  tga.estudiante_id,
  (tga.pos_in_group = 1),
  CASE WHEN tga.pos_in_group = 1 THEN TRUE ELSE random() > 0.06 END
FROM tmp_group_assignment tga;

-- 13) Asistencia semanal (periodos 1 y 2) correlacionada con perfil
WITH periodos_seed AS (
  SELECT fecha_inicio, fecha_fin
  FROM periodos_academicos
  WHERE numero IN (1, 2)
),
fechas AS (
  SELECT generate_series(
    (SELECT min(fecha_inicio) FROM periodos_seed),
    (SELECT max(fecha_fin) FROM periodos_seed),
    interval '7 day'
  )::date AS fecha
)
INSERT INTO asistencia (
  materia_id,
  estudiante_id,
  fecha,
  estado,
  observacion,
  registrado_por
)
SELECT
  ma.materia_id,
  ma.estudiante_id,
  f.fecha,
  CASE
    WHEN st.r < st.present_prob THEN 'presente'
    WHEN st.r < st.present_prob + 0.07 THEN 'tardanza'
    WHEN st.r < st.present_prob + 0.11 THEN 'justificado'
    ELSE 'ausente'
  END,
  CASE
    WHEN st.r >= st.present_prob + 0.11 AND random() < 0.40 THEN 'Ausencia sin justificacion previa'
    WHEN st.r >= st.present_prob + 0.07 AND st.r < st.present_prob + 0.11 THEN 'Excusa valida registrada'
    ELSE NULL
  END,
  m.profesor_id
FROM matriculas ma
JOIN materias m ON m.id = ma.materia_id
JOIN tmp_student_profile sp ON sp.estudiante_id = ma.estudiante_id
CROSS JOIN fechas f
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0.60, LEAST(0.94, 0.93 - sp.riesgo_ausencia * 1.6)) AS present_prob,
    random() AS r
) st;

-- 14) Resumen de asistencia por periodo
CREATE TEMP TABLE tmp_attendance_period AS
SELECT
  a.materia_id,
  a.estudiante_id,
  p.id AS periodo_id,
  count(*) AS total_registros,
  count(*) FILTER (WHERE a.estado = 'ausente') AS ausentes,
  count(*) FILTER (WHERE a.estado = 'presente') AS presentes,
  count(*) FILTER (WHERE a.estado = 'justificado') AS justificados,
  round(
    (count(*) FILTER (WHERE a.estado = 'ausente'))::numeric / NULLIF(count(*), 0),
    4
  ) AS ratio_ausencia,
  round(
    ((count(*) FILTER (WHERE a.estado IN ('presente', 'justificado'))::numeric / NULLIF(count(*), 0)) * 100),
    2
  ) AS pct_asistencia
FROM asistencia a
JOIN periodos_academicos p
  ON a.fecha BETWEEN p.fecha_inicio AND p.fecha_fin
WHERE p.numero IN (1, 2)
GROUP BY a.materia_id, a.estudiante_id, p.id;

-- 15) Nota de participacion (periodos 1 y 2)
INSERT INTO notas_participacion (
  materia_id,
  periodo_id,
  estudiante_id,
  nota,
  observacion,
  created_at,
  updated_at
)
SELECT
  ma.materia_id,
  p.id,
  ma.estudiante_id,
  round(
    LEAST(5.0, GREATEST(1.0,
      sp.base_nota
      + ((random() - 0.5) * 0.8)
      - (COALESCE(tap.ratio_ausencia, 0) * 0.8)
    ))::numeric,
    2
  ) AS nota_participacion,
  CASE
    WHEN sp.perfil = 'alto' THEN 'Participacion destacada y colaborativa'
    WHEN sp.perfil = 'medio' THEN 'Participacion constante con oportunidades de mejora'
    ELSE 'Participacion intermitente; requiere acompanamiento'
  END,
  now() - (random() * 50 || ' days')::interval,
  now() - (random() * 20 || ' days')::interval
FROM matriculas ma
JOIN tmp_student_profile sp ON sp.estudiante_id = ma.estudiante_id
JOIN periodos_academicos p ON p.numero IN (1, 2)
LEFT JOIN tmp_attendance_period tap
  ON tap.materia_id = ma.materia_id
 AND tap.estudiante_id = ma.estudiante_id
 AND tap.periodo_id = p.id;

-- 16) Respuestas online (alta cobertura para examenes activos)
INSERT INTO respuestas_online (
  estudiante_id,
  examen_id,
  respuestas_json,
  enviado_at
)
SELECT
  ma.estudiante_id,
  e.id,
  jsonb_build_object(
    'origen', 'seed_realista',
    'preguntas', jsonb_build_array(
      jsonb_build_object('numero', 1, 'respuesta', (ARRAY['A', 'B', 'C', 'D'])[1 + floor(random() * 4)::int]),
      jsonb_build_object('numero', 2, 'respuesta', (ARRAY['Verdadero', 'Falso'])[1 + floor(random() * 2)::int]),
      jsonb_build_object('numero', 3, 'respuesta', (ARRAY['A', 'B', 'C', 'D'])[1 + floor(random() * 4)::int]),
      jsonb_build_object('numero', 4, 'respuesta', CASE WHEN e.tipo = 'proyecto_grupal' THEN 'Propuesta de trabajo colaborativo con evidencias.' ELSE 'Respuesta abierta breve del estudiante.' END)
    ),
    'meta', jsonb_build_object('tiempo_minutos', 25 + floor(random() * 30)::int)
  ),
  e.fecha_activacion + ((1 + floor(random() * 4)) || ' day')::interval
FROM examenes e
JOIN matriculas ma ON ma.materia_id = e.materia_id
JOIN tmp_student_profile sp ON sp.estudiante_id = ma.estudiante_id
WHERE e.activo_online = TRUE
  AND random() < CASE
    WHEN sp.perfil = 'alto' THEN 0.97
    WHEN sp.perfil = 'medio' THEN 0.90
    ELSE 0.78
  END
ON CONFLICT (estudiante_id, examen_id) DO NOTHING;

-- 17) Base de calculo de notas (periodos 1 y 2)
CREATE TEMP TABLE tmp_note_base AS
SELECT
  ma.estudiante_id,
  e.id AS examen_id,
  e.materia_id,
  p.id AS periodo_id,
  sp.perfil,
  sp.base_nota,
  e.tipo,
  e.activo_online,
  (ro.id IS NOT NULL) AS tiene_respuesta,
  COALESCE(tap.ratio_ausencia, 0) AS ratio_ausencia,
  COALESCE(np.nota, 3.2) AS nota_participacion,
  CASE
    WHEN e.activo_online THEN
      CASE WHEN sp.perfil = 'alto' THEN 0.98 WHEN sp.perfil = 'medio' THEN 0.92 ELSE 0.80 END
    ELSE
      CASE WHEN sp.perfil = 'alto' THEN 0.97 WHEN sp.perfil = 'medio' THEN 0.90 ELSE 0.75 END
  END AS prob_entrega,
  random() AS r_entrega
FROM matriculas ma
JOIN examenes e ON e.materia_id = ma.materia_id
JOIN periodos_academicos p
  ON e.created_at::date BETWEEN p.fecha_inicio AND p.fecha_fin
 AND p.numero IN (1, 2)
JOIN tmp_student_profile sp ON sp.estudiante_id = ma.estudiante_id
LEFT JOIN respuestas_online ro
  ON ro.examen_id = e.id
 AND ro.estudiante_id = ma.estudiante_id
LEFT JOIN tmp_attendance_period tap
  ON tap.materia_id = ma.materia_id
 AND tap.estudiante_id = ma.estudiante_id
 AND tap.periodo_id = p.id
LEFT JOIN notas_participacion np
  ON np.materia_id = ma.materia_id
 AND np.estudiante_id = ma.estudiante_id
 AND np.periodo_id = p.id;

-- 18) Notas con detalle por pregunta + feedback
INSERT INTO notas (
  estudiante_id,
  examen_id,
  nota,
  detalle_json,
  retroalimentacion,
  imagen_procesada_url,
  texto_extraido,
  created_at
)
SELECT
  nb.estudiante_id,
  nb.examen_id,
  nb.nota_final,
  jsonb_build_object(
    'fuente', nb.fuente,
    'nota_total', nb.nota_final,
    'nota_maxima', 5.0,
    'calificacion_automatica', (nb.fuente = 'online'),
    'tiene_preguntas_abiertas', (nb.tipo <> 'quiz' AND random() < 0.35),
    'preguntas', jsonb_build_array(
      jsonb_build_object(
        'numero', 1,
        'tipo', 'seleccion_multiple',
        'respuesta_estudiante', (ARRAY['A', 'B', 'C', 'D'])[1 + floor(random() * 4)::int],
        'respuesta_correcta', 'A',
        'nota', round((nb.nota_final * 0.30)::numeric, 2),
        'nota_maxima', 1.5,
        'retroalimentacion', CASE WHEN nb.nota_final >= 3 THEN 'Buen manejo del concepto base.' ELSE 'Reforzar conceptos fundamentales.' END,
        'correcto', (nb.nota_final >= 3.0)
      ),
      jsonb_build_object(
        'numero', 2,
        'tipo', 'verdadero_falso',
        'respuesta_estudiante', (ARRAY['Verdadero', 'Falso'])[1 + floor(random() * 2)::int],
        'respuesta_correcta', 'Verdadero',
        'nota', round((nb.nota_final * 0.20)::numeric, 2),
        'nota_maxima', 1.0,
        'retroalimentacion', CASE WHEN nb.nota_final >= 3.5 THEN 'Analisis correcto.' ELSE 'Revisar lectura de enunciados.' END,
        'correcto', (nb.nota_final >= 3.5)
      ),
      jsonb_build_object(
        'numero', 3,
        'tipo', 'seleccion_multiple',
        'respuesta_estudiante', (ARRAY['A', 'B', 'C', 'D'])[1 + floor(random() * 4)::int],
        'respuesta_correcta', 'C',
        'nota', round((nb.nota_final * 0.30)::numeric, 2),
        'nota_maxima', 1.5,
        'retroalimentacion', CASE WHEN nb.nota_final >= 4 THEN 'Aplicacion destacada del tema.' ELSE 'Necesita mejorar aplicacion practica.' END,
        'correcto', (nb.nota_final >= 4.0)
      ),
      jsonb_build_object(
        'numero', 4,
        'tipo', 'abierta',
        'respuesta_estudiante', CASE WHEN nb.fuente = 'ocr' THEN 'Respuesta extraida por OCR para validacion docente.' ELSE 'Argumentacion escrita por el estudiante.' END,
        'respuesta_correcta', 'Respuesta argumentada con conceptos del tema',
        'nota', round((nb.nota_final * 0.20)::numeric, 2),
        'nota_maxima', 1.0,
        'retroalimentacion', CASE WHEN nb.nota_final >= 3 THEN 'Buena argumentacion general.' ELSE 'Falta profundidad y soporte conceptual.' END,
        'correcto', (nb.nota_final >= 3.0)
      )
    )
  ),
  CASE
    WHEN nb.nota_final >= 4.5 THEN 'Excelente trabajo. Mantiene consistencia, precision y analisis.'
    WHEN nb.nota_final >= 4.0 THEN 'Muy buen desempeno. Se recomienda profundizar en casos avanzados.'
    WHEN nb.nota_final >= 3.0 THEN 'Desempeno aceptable. Conviene reforzar algunos conceptos clave.'
    ELSE 'Desempeno bajo. Requiere plan de refuerzo y seguimiento personalizado.'
  END,
  CASE
    WHEN nb.fuente = 'ocr' THEN '/uploads/exposiciones/' || nb.examen_id || '/' || nb.estudiante_id || '/scan_' || substr(md5(random()::text), 1, 8) || '.jpg'
    ELSE NULL
  END,
  CASE
    WHEN nb.fuente = 'ocr' THEN 'Texto OCR simulado para pruebas de calificacion automatica y revision manual.'
    ELSE NULL
  END,
  now() - (random() * 35 || ' days')::interval
FROM (
  SELECT
    b.*,
    CASE
      WHEN b.activo_online AND b.tiene_respuesta THEN 'online'
      WHEN random() < 0.18 THEN 'ocr'
      ELSE 'manual'
    END AS fuente,
    round(
      LEAST(5.0, GREATEST(1.0,
        b.base_nota
        + CASE b.tipo WHEN 'quiz' THEN 0.18 WHEN 'parcial' THEN -0.08 ELSE 0.04 END
        - (b.ratio_ausencia * 1.45)
        + ((b.nota_participacion - 3.0) * 0.18)
        + ((random() - 0.5) * 0.9)
      ))::numeric,
      2
    ) AS nota_final
  FROM tmp_note_base b
  WHERE b.r_entrega < b.prob_entrega
    AND (b.activo_online = FALSE OR b.tiene_respuesta OR random() < 0.20)
) nb;

-- 19) Configuracion de porcentajes (sumatoria 100 por materia/periodo)
WITH ranked_exams AS (
  SELECT
    e.id AS examen_id,
    e.materia_id,
    p.id AS periodo_id,
    row_number() OVER (PARTITION BY e.materia_id, p.id ORDER BY e.created_at, e.id) AS rn
  FROM examenes e
  JOIN periodos_academicos p
    ON e.created_at::date BETWEEN p.fecha_inicio AND p.fecha_fin
  WHERE p.numero IN (1, 2)
)
INSERT INTO config_porcentajes (
  materia_id,
  periodo_id,
  examen_id,
  tipo_actividad,
  porcentaje
)
SELECT
  re.materia_id,
  re.periodo_id,
  re.examen_id,
  NULL,
  CASE re.rn
    WHEN 1 THEN 25.00
    WHEN 2 THEN 25.00
    ELSE 20.00
  END
FROM ranked_exams re
WHERE re.rn <= 3;

INSERT INTO config_porcentajes (
  materia_id,
  periodo_id,
  examen_id,
  tipo_actividad,
  porcentaje
)
SELECT
  m.id,
  p.id,
  NULL,
  'asistencia',
  15.00
FROM materias m
CROSS JOIN periodos_academicos p
WHERE p.numero IN (1, 2);

INSERT INTO config_porcentajes (
  materia_id,
  periodo_id,
  examen_id,
  tipo_actividad,
  porcentaje
)
SELECT
  m.id,
  p.id,
  NULL,
  'participacion',
  15.00
FROM materias m
CROSS JOIN periodos_academicos p
WHERE p.numero IN (1, 2);

-- 20) Boletines prepublicados para pruebas de reportes
WITH contexto AS (
  SELECT
    ma.estudiante_id,
    ma.materia_id,
    p.id AS periodo_id,
    p.numero AS periodo_numero,
    m.profesor_id
  FROM matriculas ma
  JOIN materias m ON m.id = ma.materia_id
  CROSS JOIN periodos_academicos p
  WHERE p.numero IN (1, 2)
),
exam_weight AS (
  SELECT
    c.estudiante_id,
    c.materia_id,
    c.periodo_id,
    COALESCE(SUM(COALESCE(n.nota, 0) * (cp.porcentaje / 100.0)), 0) AS exam_component,
    jsonb_agg(
      jsonb_build_object(
        'examen_id', cp.examen_id,
        'titulo', e.titulo,
        'tipo', e.tipo,
        'porcentaje', cp.porcentaje,
        'nota', COALESCE(n.nota, 0)
      )
      ORDER BY e.created_at
    ) AS exam_items
  FROM contexto c
  JOIN config_porcentajes cp
    ON cp.materia_id = c.materia_id
   AND cp.periodo_id = c.periodo_id
   AND cp.examen_id IS NOT NULL
  LEFT JOIN examenes e ON e.id = cp.examen_id
  LEFT JOIN notas n
    ON n.estudiante_id = c.estudiante_id
   AND n.examen_id = cp.examen_id
  GROUP BY c.estudiante_id, c.materia_id, c.periodo_id
),
asist_part AS (
  SELECT
    c.estudiante_id,
    c.materia_id,
    c.periodo_id,
    c.periodo_numero,
    c.profesor_id,
    COALESCE(tap.ausentes, 0) AS ausentes,
    round(GREATEST(0, 5.0 - COALESCE(tap.ausentes, 0) * 0.3)::numeric, 2) AS nota_asistencia,
    COALESCE(np.nota, 0) AS nota_participacion,
    COALESCE(cp_as.porcentaje, 0) AS pct_asistencia,
    COALESCE(cp_pa.porcentaje, 0) AS pct_participacion
  FROM contexto c
  LEFT JOIN tmp_attendance_period tap
    ON tap.materia_id = c.materia_id
   AND tap.estudiante_id = c.estudiante_id
   AND tap.periodo_id = c.periodo_id
  LEFT JOIN notas_participacion np
    ON np.materia_id = c.materia_id
   AND np.estudiante_id = c.estudiante_id
   AND np.periodo_id = c.periodo_id
  LEFT JOIN config_porcentajes cp_as
    ON cp_as.materia_id = c.materia_id
   AND cp_as.periodo_id = c.periodo_id
   AND cp_as.tipo_actividad = 'asistencia'
  LEFT JOIN config_porcentajes cp_pa
    ON cp_pa.materia_id = c.materia_id
   AND cp_pa.periodo_id = c.periodo_id
   AND cp_pa.tipo_actividad = 'participacion'
),
finales AS (
  SELECT
    ap.estudiante_id,
    ap.materia_id,
    ap.periodo_id,
    ap.periodo_numero,
    ap.profesor_id,
    ew.exam_component,
    ew.exam_items,
    ap.ausentes,
    ap.nota_asistencia,
    ap.nota_participacion,
    ap.pct_asistencia,
    ap.pct_participacion,
    LEAST(
      5.0,
      GREATEST(
        0.0,
        ew.exam_component
        + (ap.nota_asistencia * (ap.pct_asistencia / 100.0))
        + (ap.nota_participacion * (ap.pct_participacion / 100.0))
      )
    ) AS nota_final_calc,
    CASE WHEN ap.periodo_numero = 1 THEN TRUE ELSE random() < 0.72 END AS publish_flag
  FROM asist_part ap
  JOIN exam_weight ew
    ON ew.estudiante_id = ap.estudiante_id
   AND ew.materia_id = ap.materia_id
   AND ew.periodo_id = ap.periodo_id
)
INSERT INTO boletines (
  estudiante_id,
  materia_id,
  periodo_id,
  nota_final,
  desglose_json,
  publicado,
  publicado_at,
  created_by,
  created_at
)
SELECT
  f.estudiante_id,
  f.materia_id,
  f.periodo_id,
  round(f.nota_final_calc::numeric, 2),
  jsonb_build_object(
    'actividades', f.exam_items,
    'asistencia', jsonb_build_object('ausentes', f.ausentes, 'nota', f.nota_asistencia, 'porcentaje', f.pct_asistencia),
    'participacion', jsonb_build_object('nota', f.nota_participacion, 'porcentaje', f.pct_participacion),
    'componentes', jsonb_build_object('examenes', round(f.exam_component::numeric, 4))
  ),
  f.publish_flag,
  CASE WHEN f.publish_flag THEN now() - (random() * 12 || ' days')::interval ELSE NULL END,
  f.profesor_id,
  now() - (random() * 25 || ' days')::interval
FROM finales f;

-- 21) Herramientas: asignadas, listas y borradores
INSERT INTO herramientas (
  profesor_id,
  tipo,
  titulo,
  contenido_json,
  clave_respuestas,
  config_json,
  estado,
  materia_id,
  examen_id,
  created_at,
  updated_at
)
SELECT
  m.profesor_id,
  'examen',
  m.nombre || ' - Banco guiado',
  jsonb_build_object('descripcion', 'Banco de apoyo con preguntas de refuerzo', 'nivel', 'intermedio'),
  jsonb_build_object('resumen', 'clave de apoyo por temas'),
  jsonb_build_object('modo', 'asignado_desde_seed'),
  'asignado',
  m.id,
  (
    SELECT e.id
    FROM examenes e
    WHERE e.materia_id = m.id
    ORDER BY e.created_at DESC
    LIMIT 1
  ),
  now() - (random() * 30 || ' days')::interval,
  now() - (random() * 10 || ' days')::interval
FROM materias m;

INSERT INTO herramientas (
  profesor_id,
  tipo,
  titulo,
  contenido_json,
  clave_respuestas,
  config_json,
  estado,
  materia_id,
  examen_id,
  created_at,
  updated_at
)
SELECT
  m.profesor_id,
  (ARRAY['crucigrama', 'sopa_letras', 'emparejar', 'cuento', 'para_colorear'])[1 + floor(random() * 5)::int],
  m.nombre || ' - Herramienta creativa',
  jsonb_build_object('descripcion', 'Actividad lista para asignar', 'tema', m.nombre),
  jsonb_build_object('clave', 'pendiente_revision_docente'),
  jsonb_build_object('dificultad', (ARRAY['basico', 'intermedio', 'avanzado'])[1 + floor(random() * 3)::int]),
  'listo',
  m.id,
  NULL,
  now() - (random() * 20 || ' days')::interval,
  now() - (random() * 5 || ' days')::interval
FROM materias m;

INSERT INTO herramientas (
  profesor_id,
  tipo,
  titulo,
  contenido_json,
  clave_respuestas,
  config_json,
  estado,
  materia_id,
  examen_id,
  created_at,
  updated_at
)
SELECT
  m.profesor_id,
  'examen',
  m.nombre || ' - Borrador pendiente',
  jsonb_build_object('descripcion', 'Borrador para clase siguiente'),
  NULL,
  jsonb_build_object('observacion', 'Ajustar nivel y tiempo estimado'),
  'borrador',
  m.id,
  NULL,
  now() - (random() * 7 || ' days')::interval,
  now() - (random() * 2 || ' days')::interval
FROM materias m
WHERE random() < 0.65;

-- 22) Chat sessions e historial para tutor Xali
INSERT INTO chat_sessions (
  estudiante_id,
  nota_id,
  cerrada,
  preguntas_usadas,
  inicio
)
SELECT
  n.estudiante_id,
  n.id,
  random() < 0.45,
  1 + floor(random() * 5)::int,
  n.created_at + ((1 + floor(random() * 5)) || ' day')::interval
FROM notas n
WHERE random() < 0.30;

INSERT INTO chat_history (
  nota_id,
  user_id,
  role,
  content,
  created_at
)
SELECT
  cs.nota_id,
  cs.estudiante_id,
  msg.role,
  msg.content,
  cs.inicio + msg.offset_time
FROM chat_sessions cs
CROSS JOIN LATERAL (
  VALUES
    ('user', 'No entendi la pregunta 2, me la puedes explicar?', interval '1 minute'),
    ('assistant', 'Claro, identifiquemos primero la idea principal y luego aplicamos la regla.', interval '2 minutes'),
    ('user', 'Podrias darme un ejemplo similar?', interval '3 minutes'),
    ('assistant', 'Si: prueba con un caso equivalente y valida cada paso.', interval '4 minutes')
) AS msg(role, content, offset_time)
WHERE msg.role = 'user' OR random() > 0.10;

-- 23) Notificaciones (boletines, examenes y retroalimentacion)
INSERT INTO notificaciones (
  user_id,
  tipo,
  canal,
  mensaje,
  enviado,
  fecha_envio
)
SELECT
  b.estudiante_id,
  'boletin_publicado',
  CASE
    WHEN pn.acepta_whatsapp AND random() < 0.35 THEN 'whatsapp'
    ELSE 'email'
  END,
  'Tu boletin de ' || m.nombre || ' (' || p.nombre || ') ya esta disponible.',
  TRUE,
  COALESCE(b.publicado_at, now() - (random() * 8 || ' days')::interval)
FROM boletines b
JOIN materias m ON m.id = b.materia_id
JOIN periodos_academicos p ON p.id = b.periodo_id
JOIN preferencias_notif pn ON pn.user_id = b.estudiante_id
WHERE b.publicado = TRUE;

INSERT INTO notificaciones (
  user_id,
  tipo,
  canal,
  mensaje,
  enviado,
  fecha_envio
)
SELECT
  ma.estudiante_id,
  'examen_asignado',
  'email',
  'Nuevo examen activo: ' || e.titulo,
  TRUE,
  e.fecha_activacion + interval '1 hour'
FROM examenes e
JOIN matriculas ma ON ma.materia_id = e.materia_id
WHERE e.activo_online = TRUE
  AND random() < 0.20;

INSERT INTO notificaciones (
  user_id,
  tipo,
  canal,
  mensaje,
  enviado,
  fecha_envio
)
SELECT
  n.estudiante_id,
  'retroalimentacion',
  CASE WHEN random() < 0.20 THEN 'whatsapp' ELSE 'email' END,
  'Se registro retroalimentacion en el examen ' || e.titulo,
  TRUE,
  n.created_at + interval '3 hours'
FROM notas n
JOIN examenes e ON e.id = n.examen_id
WHERE random() < 0.35;

-- 24) Sesiones de acceso
INSERT INTO sesiones (
  user_id,
  ip,
  dispositivo,
  fecha_inicio,
  fecha_fin
)
SELECT
  u.id,
  ('10.10.' || ((row_number() OVER (ORDER BY u.id) % 200) + 1) || '.' || ((g.n * 17) % 240 + 10))::inet,
  (ARRAY['web', 'android', 'ios'])[1 + floor(random() * 3)::int],
  s.inicio,
  CASE WHEN random() < 0.28 THEN NULL ELSE s.inicio + ((1 + floor(random() * 10)) || ' hours')::interval END
FROM users u
JOIN generate_series(1, 3) AS g(n) ON random() < 0.62
CROSS JOIN LATERAL (
  SELECT now() - (random() * 45 || ' days')::interval AS inicio
) s;

-- 25) Logs de uso de API (volumen realista)
INSERT INTO api_usage_log (
  model,
  task,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  created_at
)
SELECT
  (ARRAY[
    'llama-4-maverick-17b',
    'llama-3.3-70b-versatile',
    'llama-4-scout-17b',
    'llama-3.1-8b-instant'
  ])[1 + floor(random() * 4)::int] AS model,
  (ARRAY[
    'generate_exam',
    'grade_online',
    'chat_response',
    'generate_crucigrama',
    'generate_sopa_letras',
    'grade_ocr'
  ])[1 + floor(random() * 6)::int] AS task,
  t.prompt_tokens,
  t.completion_tokens,
  t.prompt_tokens + t.completion_tokens,
  now() - (random() * 30 || ' days')::interval
FROM generate_series(1, 900) AS gs(n)
CROSS JOIN LATERAL (
  SELECT
    (220 + floor(random() * 1800))::numeric AS prompt_tokens,
    (120 + floor(random() * 1400))::numeric AS completion_tokens
) t;

-- 26) Audit log amplio
INSERT INTO audit_log (
  user_id,
  accion,
  detalle,
  ip,
  created_at
)
SELECT
  u.id,
  a.accion,
  jsonb_build_object(
    'seed', TRUE,
    'actor_correo', u.correo,
    'rol', u.rol,
    'modulo', (ARRAY['admin', 'reportes', 'examenes', 'asistencia', 'herramientas'])[1 + floor(random() * 5)::int]
  ),
  ('172.18.' || ((gs.n % 200) + 1) || '.' || ((gs.n % 220) + 20))::inet,
  now() - (random() * 30 || ' days')::interval
FROM generate_series(1, 650) AS gs(n)
CROSS JOIN LATERAL (
  SELECT id, correo, rol
  FROM users
  ORDER BY random()
  LIMIT 1
) u
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'admin_create_user',
    'toggle_user',
    'change_role',
    'generate_boletin',
    'save_config_porcentajes',
    'grade_online',
    'create_exam',
    'upload_ocr',
    'take_attendance',
    'publish_feedback'
  ])[1 + floor(random() * 10)::int] AS accion
) a;

-- 27) Datos de impacto de tesis (pares sin/con sistema)
WITH cohort AS (
  SELECT materia_id, count(*) AS estudiantes
  FROM matriculas
  GROUP BY materia_id
),
periodos_seed AS (
  SELECT id, numero, fecha_inicio, fecha_fin
  FROM periodos_academicos
  WHERE numero IN (1, 2)
)
INSERT INTO tiempos_evaluacion (
  profesor_id,
  materia_id,
  examen_id,
  fase,
  actividad_tipo,
  grupo_pareado,
  duracion_minutos,
  estudiantes_evaluados,
  observacion,
  created_at
)
SELECT
  m.profesor_id,
  m.id,
  ex.id,
  f.fase,
  'examen',
  'pair_' || m.codigo || '_p' || ps.numero,
  round(
    (
      CASE
        WHEN f.fase = 'sin_sistema' THEN 18 + (c.estudiantes * 0.55) + random() * 6
        ELSE 10 + (c.estudiantes * 0.30) + random() * 4
      END
    )::numeric,
    2
  ),
  c.estudiantes,
  CASE
    WHEN f.fase = 'sin_sistema' THEN 'Registro previo al uso de plataforma'
    ELSE 'Registro posterior al uso de plataforma'
  END,
  ps.fecha_inicio + ((5 + floor(random() * 35)) || ' days')::interval
FROM materias m
JOIN cohort c ON c.materia_id = m.id
JOIN periodos_seed ps ON TRUE
LEFT JOIN LATERAL (
  SELECT e.id
  FROM examenes e
  WHERE e.materia_id = m.id
    AND e.created_at::date BETWEEN ps.fecha_inicio AND ps.fecha_fin
  ORDER BY e.created_at
  LIMIT 1
) ex ON TRUE
CROSS JOIN (VALUES ('sin_sistema'), ('con_sistema')) AS f(fase);

-- 28) Encuestas de impacto (Likert + comentario cualitativo)
INSERT INTO encuestas_impacto (
  user_id,
  rol,
  hito,
  claridad,
  utilidad,
  pertinencia,
  satisfaccion,
  facilidad_uso,
  comentario,
  consentimiento,
  created_at
)
SELECT
  u.id,
  u.rol,
  'post_uso',
  CASE WHEN u.rol = 'profesor' THEN 3 + floor(random() * 3)::int ELSE 2 + floor(random() * 4)::int END,
  CASE WHEN u.rol = 'profesor' THEN 3 + floor(random() * 3)::int ELSE 2 + floor(random() * 4)::int END,
  CASE WHEN u.rol = 'profesor' THEN 3 + floor(random() * 3)::int ELSE 2 + floor(random() * 4)::int END,
  2 + floor(random() * 4)::int,
  2 + floor(random() * 4)::int,
  CASE
    WHEN random() < 0.42 THEN (ARRAY[
      'La plataforma agiliza la retroalimentacion y seguimiento.',
      'Me gustaria mas ejemplos guiados para preguntas abiertas.',
      'El flujo de calificacion es claro y rapido.',
      'La vista por estudiante facilita decisiones pedagogicas.',
      'Seria util ampliar reportes comparativos por periodo.'
    ])[1 + floor(random() * 5)::int]
    ELSE NULL
  END,
  TRUE,
  now() - (random() * 20 || ' days')::interval
FROM users u
WHERE u.rol = 'profesor'
   OR (u.rol = 'estudiante' AND random() < 0.78);

COMMIT;

-- Resumen rapido de volumen de datos
SELECT 'users' AS tabla, count(*) AS total FROM users
UNION ALL SELECT 'materias', count(*) FROM materias
UNION ALL SELECT 'matriculas', count(*) FROM matriculas
UNION ALL SELECT 'examenes', count(*) FROM examenes
UNION ALL SELECT 'respuestas_online', count(*) FROM respuestas_online
UNION ALL SELECT 'notas', count(*) FROM notas
UNION ALL SELECT 'asistencia', count(*) FROM asistencia
UNION ALL SELECT 'notas_participacion', count(*) FROM notas_participacion
UNION ALL SELECT 'config_porcentajes', count(*) FROM config_porcentajes
UNION ALL SELECT 'boletines', count(*) FROM boletines
UNION ALL SELECT 'grupos_actividad', count(*) FROM grupos_actividad
UNION ALL SELECT 'miembros_grupo', count(*) FROM miembros_grupo
UNION ALL SELECT 'herramientas', count(*) FROM herramientas
UNION ALL SELECT 'chat_sessions', count(*) FROM chat_sessions
UNION ALL SELECT 'chat_history', count(*) FROM chat_history
UNION ALL SELECT 'notificaciones', count(*) FROM notificaciones
UNION ALL SELECT 'sesiones', count(*) FROM sesiones
UNION ALL SELECT 'api_usage_log', count(*) FROM api_usage_log
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'tiempos_evaluacion', count(*) FROM tiempos_evaluacion
UNION ALL SELECT 'encuestas_impacto', count(*) FROM encuestas_impacto;