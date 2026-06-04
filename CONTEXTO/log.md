# Log del cerebro XCalificator

## 2026-06-03 - Flujo OCR por imagen con fallback

- Modulo: [[Calificacion OCR por imagen]]
- Pantalla: `/profesor/calificar/imagenes/:examenId` y ruta existente `/profesor/calificar/:examenId`
- Endpoint: `POST /api/grading/upload`
- Cambio: la subida de examenes OCR ahora usa vision por Ollama como proveedor principal y Groq Cloud como respaldo.
- Modelo principal por defecto: `gemma3` en API compatible con Ollama.
- Respaldo por defecto: `meta-llama/llama-4-scout-17b-16e-instruct` en Groq Cloud.
- Motivo: priorizar un proveedor Ollama-compatible y mantener continuidad cuando Ollama no este disponible, falle o devuelva texto vacio.
- Contrato preservado: la respuesta sigue siendo `NotaOut`; se agregan metadatos en `detalle_json` para analisis (`ocr_provider_order`, `ocr_model`, `ocr_fallback_model`).

## 2026-06-03 - OCR usa modelo Ollama del profesor

- Modulo: [[Calificacion OCR por imagen]]
- Cambio: si el profesor configura `Modelo local para OCR` en su perfil, ese modelo se promueve como modelo principal para OCR por imagen.
- Detalle tecnico: el perfil guarda `ocr_local_model` como `ocr_fallback_provider=ollama_vision` y `ocr_fallback_model`; el endpoint `/api/grading/upload` ahora lo interpreta como modelo principal de Ollama para imagenes.
- Groq se mantiene solo como respaldo y solo usa modelos Groq configurados o el fallback por defecto.

## 2026-06-03 - Persistencia de entregas OCR presenciales

- Modulo: [[Calificacion OCR por imagen]]
- Cambio: cuando el profesor toma/sube foto del examen de un estudiante, el sistema ahora registra o actualiza una entrega en `respuestas_online` con `tipo_entrega=ocr_presencial`.
- Motivo: permitir control de trabajos entregados para estudiantes sin telefono, igual que en el flujo de examenes online.
- Persistencia final:
  - `respuestas_online`: evidencia de entrega presencial, archivo, modelo VLM usado, calidad OCR y preguntas extraidas.
  - `notas`: calificacion, retroalimentacion, detalle JSON, imagen procesada y texto extraido.

## 2026-06-04 - Imagenes de presentaciones sin bancos stock

- Modulo: presentaciones y herramientas docentes.
- Cambio: se eliminaron los bancos de imagenes stock del flujo de presentaciones.
- Nueva regla: las diapositivas usan imagenes generadas por IA mediante URL de generacion (`gen.pollinations.ai`) y `POLLINATIONS_API_KEY` si esta configurada.
- Despliegue: se retiraron las variables de bancos stock y proveedor externo de imagenes de plantillas y Docker Compose.
