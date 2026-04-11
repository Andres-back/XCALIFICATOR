# Limites IA por minuto (configuracion actual)

Fecha de corte: 2026-04-10

## Configuracion base usada para este calculo
Tomada de tu configuracion mostrada y validada con la configuracion global actual:

- Calificacion (principal): `groq` + `openai/gpt-oss-120b`
- Calificacion (fallback): `groq` + `llama-3.3-70b-versatile`
- OCR imagen/examen (principal): `groq_vision` + `meta-llama/llama-4-scout-17b-16e-instruct`
- OCR (fallback): `paddleocr`
- Chatbot: selector configurable (en tu captura aparece `qwen/qwen3-32b`; el limite backend por minuto no cambia por modelo)

## Limite duro configurado en backend (por usuario, ventana de 60s)

- `POST /api/generate/*`: **10 solicitudes/min**
- `POST /api/grading/*`: **15 solicitudes/min**
- `POST /api/chat/`: **30 solicitudes/min**

Adicional para chat (regla pedagogica de sesion):

- Maximo **5 preguntas por sesion**
- Duracion de sesion: **10 minutos**

## Respuestas por minuto que puedes esperar

## 1) Calificacion de examenes (texto/ocr)
Aplica a:

- `POST /api/grading/upload` (imagen/PDF + OCR + calificacion)
- `POST /api/grading/grade-online/...`

Capacidad teorica por backend:

- **Hasta 15 respuestas calificadas por minuto por usuario**

Capacidad practica recomendada (por latencia de modelos externos):

- **8 a 12 por minuto** en uso real continuo suele ser un rango mas realista.

## 2) Imagenes (OCR de examenes)
En este proyecto, el flujo de imagen va por `grading/upload`.

Capacidad teorica por backend:

- **Hasta 15 imagenes/min** por usuario (porque comparte cupo de grading)

Notas:

- Cada imagen puede disparar OCR + LLM de calificacion, por eso el rendimiento real depende del tiempo de cada proveedor.
- Si Groq Vision falla o se satura, cae a PaddleOCR (fallback), lo que mejora resiliencia, pero no sube el tope backend de 15/min.

## 3) Chatbot (Xali)
Aplica a:

- `POST /api/chat/`

Capacidad teorica por backend:

- **Hasta 30 respuestas/min por usuario**

Pero, en UX normal del estudiante, manda mas la regla de sesion:

- **5 respuestas por sesion** (y luego debe iniciar nueva sesion)

Conclusiones practicas para chat:

- Conversacion humana normal: dificil llegar a 30/min.
- Lo que se nota primero casi siempre es el limite de sesion (5 preguntas), no el de RPM.
- El tope por minuto se nota en automatizaciones, spam o pruebas de estres.

## Formula de limite efectivo real
El limite real siempre sera:

`RPM_efectivo = min(RPM_backend, RPM_plan_proveedor, capacidad_infra)`

Donde:

- `RPM_backend` ya esta fijado arriba (10/15/30).
- `RPM_plan_proveedor` depende de tu plan/cuenta en Groq y puede variar por modelo.
- `capacidad_infra` depende de latencia, concurrencia, red, CPU/memoria.

## Se notaria el limite por minuto?
Respuesta corta: **si, pero solo en ciertos escenarios**.

- Uso normal (docente o estudiante individual): normalmente **no** se siente abrupto.
- Carga por lotes (muchas calificaciones seguidas): **si** se nota en grading/imagenes al pasar ~15/min.
- Chat en uso manual: casi nunca por RPM; se nota mas el cierre de sesion a 5 preguntas.

## Como responde el sistema cuando se llega al tope
Cuando se supera el tope por minuto:

- Backend responde `429 Too Many Requests`
- Incluye `Retry-After` (segundos sugeridos de espera)
- Incluye `X-RateLimit-Reason: per-minute`

En frontend:

- Chat distingue entre `per-minute` y `chat-session`
- Si es por minuto, muestra countdown temporal y desbloquea al terminar
- Si es por sesion, pide iniciar nueva sesion

## Recomendacion operativa
Si quieres subir capacidad para jornadas masivas de calificacion:

1. Subir limite de backend de `grading` con cuidado (por ejemplo 20-25/min).
2. Medir 429 reales de proveedor antes y despues.
3. Aplicar cola/batch para que docente no dispare rafagas manuales.
4. Mantener fallback activo (ya lo tienes) para no cortar servicio.
