# Matriz pantalla endpoint tabla

| Pantalla | Endpoint | Metodo | Tablas principales | Estado |
|---|---|---:|---|---|
| `/profesor/calificar/:examenId` | `/api/grading/upload` | POST | `examenes`, `materias`, `matriculas`, `notas` | OCR por imagen funcional |
| `/profesor/calificar/imagenes/:examenId` | `/api/grading/upload` | POST | `examenes`, `materias`, `matriculas`, `notas` | Alias directo a OCR |
| `/profesor/calificar/:examenId` | `/api/examenes/{examen_id}/respuestas-online` | GET | `respuestas_online`, `notas`, `users` | Control de entregas online y OCR presencial |
| `/profesor/presentacion` | `/api/presentaciones/clase` | POST | `herramientas`, `uploads` | Presentaciones con imagenes generadas por IA |

## Contrato OCR imagen

El endpoint conserva `NotaOut` como respuesta. Los metadatos de proveedor OCR se agregan dentro de `detalle_json` sin romper consumidores existentes.

Adicionalmente, `POST /api/grading/upload` registra una entrega en `respuestas_online` con `tipo_entrega=ocr_presencial`, para que la foto tomada por el profesor cuente como trabajo entregado.
