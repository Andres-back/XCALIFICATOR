# ARTÍCULO 28 — Evaluación y Sustentación del Documento Final

> **Fuente**: Consejo Académico, Institución Universitaria del Putumayo (Mocoa, Putumayo, Colombia).
> **Página 15/18** del documento de reglamento visible al estudiante.
> **Reproducción literal** del texto oficial que rige el proceso final de tesis.

---

## ARTÍCULO 28 (texto literal)

> Una vez el estudiante culmine el cronograma de actividades de la tesis y esté preparado para la fase de evaluación, el asesor notificará al evaluador con copia al CIECYT la entrega del documento final, el estudiante deberá cargar el documento en la carpeta digital. **Este documento deberá redactarse según la norma APA vigente con las siguientes secciones:**

- Título
- Dedicatoria (opcional)
- Agradecimiento (opcional)
- Resumen
- Palabras clave
- Abstract
- Índice
- Introducción
- Planteamiento del problema
- Justificación
- Objetivos
- Marco referencial
- Metodología
- Resultados
- Discusión
- Conclusiones
- Referencias bibliográficas
- Anexos

---

## PÁRRAFO 1 (texto literal)

> El documento final de la tesis deberá redactarse en un mínimo de cincuenta (50) y máximo noventa (90) páginas.

**Implicación técnica**: ~2500-3000 caracteres/página en Word (formato APA con interlineado 1.5). Rango objetivo: **125 000 a 270 000 caracteres de cuerpo**.

---

## PÁRRAFO 2 (texto literal)

> El jurado deberá notificar al asesor con copia al CIECYT que el documento cumple con los requisitos establecidos para ser sustentado, de haber correcciones los estudiantes implementarán las observaciones y enviarán de nuevo al asesor.

**Implicación técnica**: el flujo del proceso final tiene estos actores:

1. **Estudiante** entrega documento final + carga en carpeta digital.
2. **Asesor** notifica al **evaluador** (con copia a CIECYT) que el documento está listo.
3. **Evaluador (jurado)** revisa y notifica al **asesor** (con copia a CIECYT) si cumple requisitos.
4. Si hay correcciones: el estudiante las implementa y reenvía al asesor.
5. Si cumple: el evaluador notifica a CIECYT para programar fecha/hora de sustentación (ver PÁRRAFO 3).

---

## PÁRRAFO 3 (texto literal)

> Una vez aprobado el documento final de la tesis, el evaluador notificará al CIECYT, en el formato que se designe para tal fin, para que programe fecha y hora de sustentación.

**Implicación técnica**: el formato de notificación a CIECYT es externo al sistema. Lo que sí podemos sistematizar: una **notificación interna** dentro de XCalificator (correo o Telegram) que indique al estudiante y al asesor cuando el documento es aprobado para sustentación.

---

## PÁRRAFO 4 (texto literal)

> La nota final de esta opción de grado se establece de acuerdo al artículo 14, párrafo 7 de la presente norma.

**Implicación técnica**: el artículo 14, párrafo 7 (no transcrito en este vault) define la **escala de calificación** de la opción de grado "tesis". Típicamente en UNIMAYO es:

- Aprobada: 3.5 a 5.0
- Meritoria: 4.5 a 5.0 (recomendación)
- Laureada: 5.0 (caso excepcional)

> TODO: transcribir el ARTÍCULO 14 PÁRRAFO 7 al vault si se requiere precisión.

---

## PÁRRAFO 5 (texto literal)

> El jurado informará la decisión a los estudiantes a través de la lectura del formato de evaluación de sustentación de la opción de grado.

**Implicación técnica**: existe un formato institucional (papel/firmado) que el jurado lee al estudiante al final de la sustentación. XCalificator puede archivar una **copia digital** de ese formato en el expediente del estudiante, pero NO reemplaza al formato físico firmado.

---

## Resumen del flujo regulatorio

```
┌─────────────────────┐
│ Estudiante carga     │
│ documento final en   │
│ carpeta digital +    │
│ notifica a asesor    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Asesor notifica a     │
│ evaluador (copia     │
│ CIECYT)              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Evaluador (jurado)   │
│ revisa el doc         │
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     │            │
   cumple    NO cumple
     │            │
     │            ▼
     │      Estudiante implementa
     │      correcciones y reenvía
     │      (loop hasta que cumpla)
     │            │
     ▼            │
┌─────────────────────┐
│ Evaluador notifica a │
│ CIECYT para agendar  │
│ fecha/hora           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Sustentación pública│
│ (presentación +      │
│ preguntas del jurado)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Jurado lee formato   │
│ de evaluación;       │
│ asigna nota final    │
│ (art. 14, párr. 7)   │
└─────────────────────┘
```

---

## Checklist de cumplimiento del sistema XCalificator

- [ ] Estructura APA con las 18 secciones (ver `auditoria_tesis_2026-06-08.md`)
- [ ] 50-90 páginas de cuerpo
- [ ] Resumen y Abstract en español e inglés
- [ ] Palabras clave (Keywords)
- [ ] Planteamiento del problema con pregunta de investigación e hipótesis
- [ ] Marco referencial con antecedentes, teórico, conceptual, contextual, legal
- [ ] Metodología con fases, instrumentos, trazabilidad
- [ ] Resultados con datos reales del piloto (kappa, Likert, tiempos)
- [ ] Discusión con triangulación
- [ ] Conclusiones
- [ ] Referencias bibliográficas en formato APA
- [ ] Anexos (propuesta original, matriz de literatura, arquitectura, instrumentos, evidencias técnicas)

---

## Relacionado

- [[Matriz pantalla endpoint tabla]] — qué pantallas/endpoints/tablas existen en el sistema
- [[Calificacion OCR por imagen]] — spec del módulo central de la tesis
- [[auditoria_tesis_2026-06-08]] — auditoría específica del cumplimiento
- `log.md` — registro cronológico de cambios
