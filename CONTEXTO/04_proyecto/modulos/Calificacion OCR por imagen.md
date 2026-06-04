# Calificacion OCR por imagen

## Proposito

Permitir que el docente suba una imagen o PDF del examen en papel para extraer texto, interpretar respuestas y guardar la nota del estudiante.

## Pantallas y rutas

- `/profesor/calificar/:examenId`: pantalla general de calificacion.
- `/profesor/calificar/imagenes/:examenId`: alias que abre directamente la pestana OCR.

## Endpoint principal

- `POST /api/grading/upload`
- Form data:
  - `examen_id`
  - `estudiante_id`
  - `file`

## Flujo actual

1. Valida tipo y tamano del archivo.
2. Verifica que el docente tenga acceso al examen y que el estudiante este matriculado.
3. Guarda el archivo original en uploads.
4. Construye configuracion OCR especifica para imagen:
   - principal: `ollama_vision` con el modelo de vision disponible/configurado por el profesor.
   - fallback: `groq_vision`
5. Preprocesa imagen con OpenCV.
6. Extrae texto con Ollama vision.
7. Si Ollama falla o devuelve texto vacio, extrae texto con Groq vision.
8. Parseo de preguntas/respuestas.
9. Control de calidad OCR:
   - baja: deja nota pendiente de revision manual.
   - media: guarda advertencia.
   - alta: continua normal.
10. Califica preguntas objetivas localmente y preguntas abiertas con LLM.
11. Persiste o actualiza `RespuestaOnline` como entrega presencial OCR.
12. Persiste `Nota` con `detalle_json`, retroalimentacion, archivo procesado y texto extraido.

## Seleccion de modelos

- Ollama principal:
  - Primero usa el modelo configurado por el profesor como `Modelo local para OCR`.
  - Si no hay modelo del profesor, usa `OLLAMA_CLOUD_OCR_MODEL`.
  - Si no hay modelo cloud, usa `OCR_OLLAMA_MODEL`.
  - Si no hay variable configurada, usa `gemma3`.
- Groq fallback: `meta-llama/llama-4-scout-17b-16e-instruct`
  - Razon: modelo multimodal con entrada texto+imagen, contexto alto y limites gratuitos base suficientes para respaldo.

## Variables de entorno

- `OLLAMA_URL`
- `OLLAMA_API_KEY`
- `OCR_OLLAMA_MODEL`
- `OCR_GROQ_FALLBACK_MODEL`
- `GROQ_API_KEY`

## Persistencia y trazabilidad

El flujo usa dos capas:

- `respuestas_online`: control de entrega. Para foto tomada por el profesor se guarda `tipo_entrega=ocr_presencial`, `origen=profesor_foto`, archivo, modelo VLM, fallback, calidad OCR y preguntas extraidas.
- `notas`: resultado academico. Guarda nota, retroalimentacion, `detalle_json`, imagen procesada y texto extraido.

La nota guarda metadatos de la cadena OCR:

- `ocr_provider_order`
- `ocr_model`
- `ocr_fallback_model`
- `ocr_quality`
- `ocr_motivo`
