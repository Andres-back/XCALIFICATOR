# MEJORAS FUTURAS — Xcalificator

> Documento de mejoras pendientes, funcionalidades parciales y oportunidades de evolución identificadas para versiones futuras del proyecto.

---

## Estado Actual (v1.2)

La plataforma cuenta con 13 módulos funcionales: autenticación, gestión de materias, generación de exámenes con IA, calificación inteligente (local + LLM + OCR), chatbot Xali con sesiones, herramientas didácticas, períodos académicos, control de asistencia, reportes/boletines, modo grupal, notificaciones, administración y auditoría.

---

## 1. Autenticación y Seguridad

### 1.1 Verificación de correo electrónico
- **Estado**: No implementado.
- **Descripción**: Actualmente no se valida el email al registrarse. Se debería implementar un flujo de confirmación por correo (token de verificación) antes de activar la cuenta.
- **Prioridad**: Alta.

### 1.2 Recuperación de contraseña
- **Estado**: No implementado.
- **Descripción**: No existe un flujo de "Olvidé mi contraseña" con enlace de restablecimiento por email.
- **Prioridad**: Alta.

### 1.3 Mejoras en Google OAuth
- **Estado**: Funcional, pero con casos borde no cubiertos.
- **Descripción**: El flujo de Google OAuth puede fallar si el usuario no tiene foto de perfil o si revoca permisos. Mejorar el manejo de errores y la experiencia de usuario.
- **Prioridad**: Media.

### 1.4 Cuotas individuales de tokens LLM
- **Estado**: No implementado.
- **Descripción**: El rate limiting usa Redis globalmente, pero no impone límites individuales de tokens LLM por profesor. Agregar cuotas configurables por cuenta para controlar costos.
- **Prioridad**: Media.

### 1.5 Refresh token rotation
- **Estado**: Parcial.
- **Descripción**: El backend soporta refresh tokens pero no implementa rotación (invalidar el token anterior al emitir uno nuevo). Esto mejoraría la seguridad contra robo de tokens.
- **Prioridad**: Baja.

---

## 2. Frontend y Experiencia de Usuario

### 2.1 Build de producción
- **Estado**: En desarrollo.
- **Descripción**: Actualmente se ejecuta `vite --host` (modo desarrollo) dentro del contenedor Docker. Para producción, se debería hacer `vite build` y servir los archivos estáticos con Nginx directamente, eliminando el contenedor de frontend.
- **Prioridad**: Alta.

### 2.2 Actualización en tiempo real (WebSockets)
- **Estado**: No implementado.
- **Descripción**: Los profesores deben recargar la página para ver nuevas entregas de exámenes. Implementar WebSockets o Server-Sent Events (SSE) para:
  - Notificar al profesor cuando un estudiante entrega un examen.
  - Actualizar la lista de miembros de un grupo en tiempo real.
  - Notificar al estudiante cuando su examen es calificado.
- **Prioridad**: Alta.

### 2.3 Progressive Web App (PWA)
- **Estado**: No implementado.
- **Descripción**: Convertir la aplicación en PWA con service worker, manifest y soporte offline para consultas de notas. Mejoraría la experiencia en dispositivos móviles.
- **Prioridad**: Media.

### 2.4 Internacionalización (i18n)
- **Estado**: No implementado.
- **Descripción**: La plataforma está completamente en español. Agregar soporte multi-idioma (al menos inglés) usando `react-i18next`.
- **Prioridad**: Baja.

### 2.5 Tema oscuro
- **Estado**: No implementado.
- **Descripción**: La interfaz solo tiene tema claro. Agregar soporte para modo oscuro usando las clases `dark:` de Tailwind CSS.
- **Prioridad**: Baja.

### 2.6 Accesibilidad (a11y)
- **Estado**: Parcial.
- **Descripción**: Mejorar etiquetas ARIA, navegación por teclado, contraste de colores y lectores de pantalla en todos los componentes interactivos.
- **Prioridad**: Media.

---

## 3. Funcionalidades Académicas

### 3.1 Exportación de notas a CSV/Excel
- **Estado**: No implementado.
- **Descripción**: No existe opción de exportar calificaciones del curso. Agregar botón de descarga en CSV o Excel en el panel de métricas y en la vista de calificaciones por materia.
- **Prioridad**: Alta.

### 3.2 Importación masiva de estudiantes
- **Estado**: No implementado.
- **Descripción**: Los profesores deben agregar estudiantes uno a uno a las materias. Permitir carga de listados en CSV/Excel con validación de datos (documento, correo, nombre).
- **Prioridad**: Alta.

### 3.3 Control de versiones de exámenes
- **Estado**: No implementado.
- **Descripción**: Al editar un examen ya publicado, se sobrescribe directamente. Implementar historial de versiones para preservar calificaciones anteriores y auditabilidad.
- **Prioridad**: Media.

### 3.4 Evolución longitudinal del estudiante
- **Estado**: Parcial (el boletín muestra promedios por período, pero no gráficas de progreso).
- **Descripción**: Agregar una vista de curva de progreso a lo largo del tiempo, comparativa entre períodos y materias.
- **Prioridad**: Media.

### 3.5 Horarios y calendario
- **Estado**: No implementado.
- **Descripción**: Integrar un calendario con fechas de exámenes programados, entregas pendientes y vista semanal de clases.
- **Prioridad**: Baja.

### 3.6 Banco de preguntas
- **Estado**: No implementado.
- **Descripción**: Permitir a los profesores guardar preguntas generadas en un banco reutilizable, clasificadas por tema, dificultad y tipo, para crear exámenes mixtos (IA + manuales).
- **Prioridad**: Media.

### 3.7 Exámenes programados con temporizador
- **Estado**: Parcial (el modelo `Examen` tiene `duracion_minutos` pero el frontend no implementa un cronómetro de cuenta regresiva con bloqueo automático).
- **Descripción**: Implementar un temporizador visible durante la resolución del examen que bloquee el envío al vencer el tiempo.
- **Prioridad**: Alta.

---

## 4. Inteligencia Artificial y OCR

### 4.1 Pre-procesamiento de imágenes OCR
- **Estado**: No implementado.
- **Descripción**: La precisión de PaddleOCR depende de la calidad de la foto. Agregar pipeline de pre-procesamiento (corrección de perspectiva, binarización adaptativa, reducción de ruido, recorte automático) antes de enviar al servicio OCR.
- **Prioridad**: Alta.

### 4.2 Detección de plagio
- **Estado**: No implementado.
- **Descripción**: Las respuestas abiertas de diferentes estudiantes no se comparan entre sí. Integrar detección de similitud textual (TF-IDF, cosine similarity o embeddings) para alertar sobre respuestas idénticas o muy similares.
- **Prioridad**: Media.

### 4.3 Contexto cross-examen en Xali
- **Estado**: No implementado.
- **Descripción**: El chatbot Xali solo tiene contexto del examen de la sesión actual. Extender para que pueda comparar resultados entre exámenes, sugerir temas a reforzar y ofrecer explicaciones basadas en las respuestas incorrectas del estudiante.
- **Prioridad**: Media.

### 4.4 Validación algorítmica de puzzles
- **Estado**: Parcial (se valida estructura, pero no se garantiza que las sopas de letras contengan todas las palabras ni que los crucigramas sean resolubles).
- **Descripción**: Agregar un validador post-generación que verifique que:
  - Las sopas de letras contengan todas las palabras en la grilla.
  - Los crucigramas no tengan conflictos de letras cruzadas.
  - Regenerar automáticamente si la validación falla.
- **Prioridad**: Alta.

### 4.5 Múltiples proveedores de LLM
- **Estado**: No implementado (solo Groq).
- **Descripción**: Agregar soporte para OpenAI, Anthropic u Ollama como proveedores alternativos de LLM. Permitir configuración desde el panel admin.
- **Prioridad**: Baja.

### 4.6 Retroalimentación mejorada
- **Estado**: Funcional pero básica.
- **Descripción**: La retroalimentación del LLM para preguntas abiertas es un texto plano. Mejorar para incluir sugerencias de estudio, referencias al contenido base y puntuación desglosada por criterio.
- **Prioridad**: Media.

---

## 5. Modo Grupal

### 5.1 Invitación por correo/código
- **Estado**: Parcial (invitación solo por ID de estudiante).
- **Descripción**: Permitir invitar miembros por correo electrónico o mediante un código/enlace de invitación que simplifique el proceso.
- **Prioridad**: Media.

### 5.2 Chat grupal
- **Estado**: No implementado.
- **Descripción**: Agregar un chat interno entre miembros del grupo para coordinar respuestas durante la resolución del examen.
- **Prioridad**: Baja.

### 5.3 Roles dentro del grupo
- **Estado**: Parcial (solo creador vs miembro).
- **Descripción**: Implementar roles diferenciados (líder que envía, miembros que solo responden su sección) para exámenes con preguntas distribuidas.
- **Prioridad**: Baja.

---

## 6. Notificaciones

### 6.1 Notificaciones push
- **Estado**: No implementado.
- **Descripción**: Actualmente solo se soporta email (SMTP) y WhatsApp (Whapi). Agregar notificaciones push del navegador usando Web Push API.
- **Prioridad**: Media.

### 6.2 Notificaciones automáticas
- **Estado**: Parcial (se envían manualmente).
- **Descripción**: Automatizar el envío de notificaciones cuando:
  - Un profesor publica un nuevo examen.
  - Se califica un examen del estudiante.
  - Se acerca la fecha límite de un examen.
  - Se genera un boletín.
- **Prioridad**: Alta.

---

## 7. Infraestructura y DevOps

### 7.1 Archivo `.env.example`
- **Estado**: No incluido en el repositorio.
- **Descripción**: Crear un `.env.example` con todas las variables necesarias documentadas y valores por defecto seguros para facilitar el onboarding de nuevos desarrolladores.
- **Prioridad**: Alta.

### 7.2 Pruebas automatizadas
- **Estado**: No implementado.
- **Descripción**: No existe suite de tests. Implementar:
  - **Backend**: pytest + httpx para tests de endpoints, tests unitarios de `groq_service`, `pdf_service`, funciones de calificación.
  - **Frontend**: Vitest + React Testing Library para componentes críticos.
  - **E2E**: Playwright o Cypress para flujos principales (login → generar examen → resolver → calificar).
- **Prioridad**: Alta.

### 7.3 CI/CD Pipeline
- **Estado**: No implementado.
- **Descripción**: Configurar GitHub Actions para:
  - Linting (ruff para Python, ESLint para JS).
  - Ejecución de tests en cada PR.
  - Build automático de imágenes Docker.
  - Deploy automático a staging.
- **Prioridad**: Alta.

### 7.4 Backups automáticos
- **Estado**: No implementado.
- **Descripción**: No hay política de respaldo del volumen PostgreSQL. Configurar `pg_dump` programado (cron job o Docker sidecar) hacia almacenamiento externo (S3, GCS, volume externo).
- **Prioridad**: Alta.

### 7.5 Logs centralizados y monitoreo
- **Estado**: No implementado.
- **Descripción**: Los logs de los 7 contenedores no están centralizados. Integrar:
  - Loki + Grafana para logs.
  - Prometheus + Grafana para métricas de rendimiento.
  - Alertas por correo ante errores críticos o caída de servicios.
- **Prioridad**: Media.

### 7.6 Migraciones de base de datos
- **Estado**: No implementado (se usa `init.sql` directo).
- **Descripción**: Integrar Alembic para migraciones incrementales de la base de datos, permitiendo evolucionar el schema sin perder datos en producción.
- **Prioridad**: Alta.

### 7.7 Rate limiting granular
- **Estado**: Parcial (global por IP).
- **Descripción**: Implementar rate limiting por usuario autenticado y por endpoint específico (ej: límites diferentes para generación IA vs consultas simples).
- **Prioridad**: Media.

---

## 8. Mejoras de Rendimiento

### 8.1 Paginación en listados
- **Estado**: Parcial (algunos endpoints devuelven todos los registros).
- **Descripción**: Implementar paginación cursor-based o offset en todos los endpoints que devuelven listas (notas, exámenes, auditoría, notificaciones).
- **Prioridad**: Media.

### 8.2 Caché de consultas frecuentes
- **Estado**: No implementado.
- **Descripción**: Cachear en Redis las consultas frecuentes como lista de materias, exámenes publicados, configuración de porcentajes, reduciendo carga en PostgreSQL.
- **Prioridad**: Baja.

### 8.3 Lazy loading de componentes
- **Estado**: No implementado.
- **Descripción**: Implementar `React.lazy()` + `Suspense` para cargar las páginas bajo demanda, reduciendo el bundle inicial.
- **Prioridad**: Baja.

---

## Resumen de Prioridades

| Prioridad | Cantidad | Ejemplos clave |
|-----------|----------|----------------|
| **Alta** | 14 | Verificación email, build producción, WebSockets, exportar notas, tests, CI/CD, Alembic, backups, validación puzzles |
| **Media** | 14 | Cuotas LLM, OAuth mejorado, detección plagio, banco preguntas, push notifications, monitoreo |
| **Baja** | 7 | i18n, tema oscuro, múltiples LLMs, chat grupal, lazy loading |

---

*Última actualización: Junio 2025*
