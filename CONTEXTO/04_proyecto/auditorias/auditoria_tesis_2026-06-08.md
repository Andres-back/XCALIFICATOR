# Auditoría de cumplimiento ARTÍCULO 28 — Tesis v3 (2026-06-08)

> **Documento auditado**: `outputs/tesis_xcalificator_apa_v3.docx` (versión más reciente a 2026-06-08).
> **Norma de referencia**: [[ARTICULO_28_Consejo_Academico]] — Consejo Académico UNIMAYO, página 15/18.
> **Auditor**: agente IA + revisión manual.

---

## Resumen ejecutivo

| Métrica | Valor | Cumple ARTÍCULO 28 |
|---|---|---|
| Secciones H1 obligatorias presentes | **18 de 18** | ✅ |
| Páginas estimadas (2500 chars/pág) | **~23** | ❌ (rango 50-90) |
| Secciones con contenido placeholder | 4 (Dedicatoria, Agradecimiento, 2 falsos positivos en Metodología/Resultados por detector) | ⚠️ |
| Tablas | 12 | ✅ |
| Referencias bibliográficas | 5807 chars (≈15-25 referencias) | ✅ |
| Anexos | 6 sub-secciones (A-F) | ✅ |

**Veredicto**: La **estructura cumple al 100%** con ARTÍCULO 28 (todas las 18 secciones están), pero la **extensión es insuficiente** (~23 págs vs mínimo 50). Hay que **expandir al menos 27 páginas adicionales**, principalmente en:

- **Metodología**: ya tiene 15022 chars pero mi detector marcó "placeholder" — verificar si es falso positivo.
- **Resultados**: 1443 chars — necesita multiplicarse por 5-10x.
- **Discusión**: 1874 chars — necesita multiplicarse por 3-5x.
- **Conclusiones**: 548 chars — necesita multiplicarse por 2-3x.

---

## Detalle por sección

| # | Sección | Chars | Páginas est. | Estado |
|---|---|---:|---:|---|
| 1 | (Título) | 1766 | 0.7 | ✅ (implica) |
| 2 | Dedicatoria (opcional) | 57 | 0.0 | ⚠️ Marcada "Pendiente" — opcional, OK |
| 3 | Agradecimiento (opcional) | 57 | 0.0 | ⚠️ Marcada "Pendiente" — opcional, OK |
| 4 | Resumen | 2242 | 0.9 | ✅ |
| 5 | Palabras clave | 161 | 0.1 | ✅ |
| 6 | Abstract | 2005 | 0.8 | ✅ |
| 7 | Índice | 151 | 0.1 | ✅ |
| 8 | Introducción | 1958 | 0.8 | ✅ |
| 9 | Planteamiento del problema | 2379 | 1.0 | ✅ |
| 10 | Justificación | 1753 | 0.7 | ✅ |
| 11 | Objetivos | 1158 | 0.5 | ✅ |
| 12 | Marco referencial | 5035 | 2.0 | ✅ |
| 13 | **Metodología** | 15022 | 6.0 | ✅ (verificar falso positivo de "placeholder") |
| 14 | **Resultados** | 1443 | 0.6 | ❌ Muy corto |
| 15 | **Discusión** | 1874 | 0.7 | ❌ Muy corto |
| 16 | **Conclusiones** | 548 | 0.2 | ❌ Muy corto |
| 17 | Referencias bibliográficas | 5807 | 2.3 | ✅ |
| 18 | Anexos | 1708 | 0.7 | ✅ |
| **TOTAL** | | **46 043** | **~18.4 (texto) + 12 × 0.4 (tablas) ≈ 23** | |

---

## Gaps identificados vs ARTÍCULO 28

### A. Estructura

✅ **Las 18 secciones obligatorias están presentes** (Título implícito en la primera página; Dedicatoria/Agradecimiento marcadas como opcionales y como "pendiente" — válido).

### B. Extensión (PÁRRAFO 1)

❌ **23 páginas estimadas vs mínimo 50**. Faltan **~27 páginas**.

| Sección actual | Páginas est. | Páginas objetivo | Delta | Sugerencia |
|---|---:|---:|---:|---|
| Resultados | 0.6 | 5-7 | +5 | Agregar datos cuantitativos del piloto: tiempos pre/post, kappa, Likert, ejemplos de retroalimentación |
| Discusión | 0.7 | 4-6 | +5 | Triangular con literatura (Creagh 2023, Fundar sesgos, Hattie 2007), comparar con EdTech existente |
| Conclusiones | 0.2 | 1-2 | +1 | Listar 4-6 conclusiones explícitas alineadas con objetivos |
| Marco referencial | 2.0 | 4-6 | +3 | Expandir marco teórico con LLM, RAG, evaluación formativa, sesgos algorítmicos |
| Metodología | 6.0 | 8-10 | +3 | Detallar instrumentos (kappa paso a paso, Likert 1-5, plan de análisis) |
| Anexos | 0.7 | 5-8 | +5 | Expandir Anexo E (evidencias técnicas) y Anexo F (matriz de trazabilidad) |

### C. Contenido placeholder

⚠️ Dedicatoria y Agradecimiento marcadas "Pendiente de redacción por los autores" — **opcional** per ARTÍCULO 28, pero se recomienda que los autores redacten algo personal para que el documento no se vea incompleto ante el jurado.

### D. Datos reales del piloto (resultados)

El **cerebro de Obsidian** tiene el commit `2026-06-03 — Persistencia de entregas OCR presenciales` con métricas, pero el **documento v3** parece tener solo 1443 chars en Resultados. Es necesario **volcar los datos del piloto** (que sí están en el sistema: `api_usage_logs`, `notas`, `encuesta_impacto`, `tiempos_evaluacion`) al documento.

Endpoints útiles para extraer los datos:
- `GET /api/tesis/tiempos/resumen`
- `GET /api/tesis/concordancia/kappa`
- `GET /api/tesis/encuestas/resumen`
- `GET /api/tesis/cualitativo`
- `GET /api/admin/api-usage`

---

## Pendientes por sección

### Resultados (ampliar de 0.6 a 5-7 págs)

- [ ] **R1.1** Tiempos de calificación pre/post piloto (gráfico + tabla)
- [ ] **R1.2** Concordancia inter-evaluador IA vs humano (Cohen Kappa con IC 95%)
- [ ] **R1.3** Satisfacción de docentes (Likert 1-5, n=?)
- [ ] **R1.4** Satisfacción de estudiantes
- [ ] **R1.5** Análisis cualitativo de comentarios abiertos (temas recurrentes)
- [ ] **R1.6** Casos de estudio: 3 exámenes representativos con retroalimentación IA
- [ ] **R1.7** Métricas de uso: requests a Groq/Ollama, latencias, fallos de OCR

### Discusión (ampliar de 0.7 a 4-6 págs)

- [ ] **D1.1** Comparar resultados con literatura (Creagh 2023, Fundar sesgos)
- [ ] **D1.2** Analizar por qué el OCR tuvo X% de calidad baja
- [ ] **D1.3** Discutir limitaciones del estudio (muestra, tiempo, alcance)
- [ ] **D1.4** Triangular con Hattie (2007) sobre el efecto de la retroalimentación
- [ ] **D1.5** Sesgos algorítmicos detectados (sesgo de modelo, sesgo de prompt)

### Conclusiones (ampliar de 0.2 a 1-2 págs)

- [ ] **C1** XCalificator reduce X% el tiempo de calificación
- [ ] **C2** La concordancia IA-humano es Kappa=X (sustenta que la IA es confiable)
- [ ] **C3** Los docentes perciben valor (Likert=X/5)
- [ ] **C4** Limitaciones: requiere conexión estable, model selection es crítica
- [ ] **C5** Trabajo futuro: integrar más LLMs, soporte offline, multimodal

### Marco referencial (ampliar de 2.0 a 4-6 págs)

- [ ] Expandir marco teórico con: arquitectura transformer, attention, fine-tuning
- [ ] Expandir marco conceptual con: evaluación formativa vs sumativa, retroalimentación
- [ ] Expandir marco contextual con: más datos de la IE Comercial San Agustín

---

## Proceso regulatorio (PÁRRAFO 2-5)

| Paso | Actor | Acción | Estado en XCalificator |
|---|---|---|---|
| 1 | Estudiante | Carga documento final en carpeta digital | ❌ No implementado (carpeta digital institucional, fuera del sistema) |
| 2 | Asesor | Notifica a evaluador con copia a CIECYT | ❌ No implementado (flujo externo) |
| 3 | Evaluador | Revisa y notifica al asesor | ❌ No implementado |
| 4 | Estudiante | Implementa correcciones y reenvía | ❌ No implementado |
| 5 | Evaluador | Notifica a CIECYT para agendar fecha/hora | ❌ No implementado |
| 6 | Público | Sustentación | ❌ No implementado (es ceremonia) |
| 7 | Jurado | Lee formato de evaluación, asigna nota | ⚠️ `encuesta_impacto` y `notas` registran datos, pero no el formato oficial |

> **Recomendación**: el sistema XCalificator puede **facilitar la trazabilidad** (quién hizo qué cuándo) pero el **proceso regulatorio es externo** al software. Lo que sí podemos sistematizar: notificaciones automáticas por Telegram/email cuando el documento está aprobado, y un **log de auditoría** con quién revisó qué y cuándo.

---

## Plan de acción inmediato

1. **Expandir Resultados** con datos del piloto (5-7 págs adicionales)
2. **Expandir Discusión** con triangulación literaria (4-6 págs)
3. **Expandir Conclusiones** con bullets explícitos (1-2 págs)
4. **Expandir Marco referencial** con más profundidad (3-4 págs)
5. **Expandir Anexos** con más evidencias técnicas y matriz de trazabilidad completa (5-8 págs)
6. **Redactar Dedicatoria y Agradecimiento** (opcional pero recomendado)
7. **Verificar con un generador APA** que el formato de citas y referencias sea correcto

**Resultado esperado**: ~50-60 páginas de cuerpo, dentro del rango permitido por ARTÍCULO 28 PÁRRAFO 1.

---

## Trazabilidad

- Documento fuente: `outputs/tesis_xcalificator_apa_v3.docx` (46 043 chars, 275 párrafos, 12 tablas)
- Norma fuente: `CONTEXTO/04_proyecto/reglamentos/ARTICULO_28_Consejo_Academico.md` (página 15/18 del doc oficial)
- Auditoría generada: 2026-06-08
- Relacionado: [[Calificacion OCR por imagen]], [[Matriz pantalla endpoint tabla]]
