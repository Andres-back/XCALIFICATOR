# AGENTS.md — Reglas del vault XCalificator

> **Este archivo documenta las reglas que cualquier agente (humano o IA) debe respetar al trabajar con este vault de Obsidian.**

## 1. Propósito del vault

Este vault documenta el sistema XCalificator — una plataforma educativa con IA para calificación automática de exámenes manuscritos. **NO contiene código fuente** (regla absoluta). Solo documenta:

- Decisiones arquitectónicas (en `04_proyecto/modulos/`)
- Contratos entre UI ↔ API ↔ DB (en `04_proyecto/contratos/`)
- Estado del proyecto (en `log.md` raíz)
- Outputs generados (en `05_outputs/`)
- Bibliografía de soporte (en `bibliografia/`)

## 2. Reglas de oro

### 2.1. El código vive en el repo, NO en el vault

- ❌ NO pegar código fuente en notas `.md`.
- ✅ Si necesitas referenciar un archivo, usa link relativo con nombre: `[`ocr_service.py`](../../backend/app/services/ocr_service.py)`.
- ❌ NO copiar tablas SQL en notas — referencia el modelo: `[[modelo:RespuestaOnline]]`.
- ✅ Las pantallas, endpoints y tablas se documentan en `04_proyecto/contratos/Matriz pantalla endpoint tabla.md` como **referencia**, no como copia.

### 2.2. Capas separadas

- **Vault** = decisiones, contratos, historia.
- **Código** = implementación.
- **No sincronización bidireccional**: si cambia el código, actualiza el vault manualmente. Si cambia el vault, el código puede quedar desactualizado (es un riesgo aceptable, documentar en `log.md`).

### 2.3. log.md es la fuente de verdad del estado

- Antes de iniciar trabajo, lee `log.md` para saber qué se hizo antes.
- Después de cada cambio material, **actualiza `log.md`** con: commit hash, módulo, qué cambió, por qué.
- Formato: `## YYYY-MM-DD — Título descriptivo\n- Módulo: [[link]]\n- Pantalla: ...\n- Endpoint: ...\n- Cambio: ...\n- Razón: ...`

### 2.4. Enlaces Obsidian

- Usa `[[Nombre de la nota]]` para referenciar otras notas del vault.
- Usa `[[archivo.py]]` o `[[carpeta/archivo]]` para referenciar código (como links relativos).
- Los enlaces NO deben romperse al renombrar archivos en el repo (preferir nombres de módulo o de pantalla, no de archivo).

## 3. Estructura del vault

```
CONTEXTO/
├── log.md                        # Estado cronológico del proyecto
├── AGENTS.md                     # Este archivo (reglas)
├── 04_proyecto/
│   ├── reglamentos/              # Normativa institucional
│   │   └── ARTICULO_28_Consejo_Academico.md
│   ├── contratos/                # UI ↔ API ↔ DB matrices
│   │   └── Matriz pantalla endpoint tabla.md
│   ├── modulos/                  # Specs detalladas
│   │   └── Calificacion OCR por imagen.md
│   └── auditorias/               # Revisiones periodicas del sistema/tesis
│       └── auditoria_tesis_2026-06-08.md
├── 05_outputs/
│   ├── informes/                 # Tesis en Word/PDF
│   └── presentaciones/            # PPTs
└── biblioteca/                   # Papers de referencia
```

## 4. Convenciones de nombrado

- **Notas de módulo**: PascalCase + nombre del módulo (`Calificacion OCR por imagen.md`).
- **Notas de contrato**: Sustantivo + tipo (`Matriz pantalla endpoint tabla.md`).
- **Entradas de log**: Fecha ISO + título corto (`## 2026-06-04 — Sistema completo para defensa`).

## 5. Lo que NO va en el vault

- ❌ API keys, tokens, passwords, secrets.
- ❌ Datos personales de usuarios.
- ❌ Capturas de pantalla con datos reales.
- ❌ Logs de error con stack traces reales.
- ❌ Código fuente (ni siquiera snippets cortos).
- ❌ Configuraciones específicas del entorno.

## 6. Lo que SÍ va en el vault

- ✅ Decisiones arquitectónicas con justificación.
- ✅ Diagramas de flujo (Mermaid, ASCII art).
- ✅ Contratos UI↔API↔DB.
- ✅ Métricas de impacto (kappa, NPS, tiempos).
- ✅ Referencias a papers en `bibliografia/`.
- ✅ Cambios de estado del proyecto en `log.md`.
- ✅ Hallazgos de tests, bugfixes materiales, releases.

## 7. Para agentes IA que trabajan con este vault

1. **Lee `log.md` primero** para entender el estado actual.
2. **Lee `04_proyecto/modulos/`** para entender la spec del módulo que vas a tocar.
3. **Lee `04_proyecto/contratos/`** para entender qué endpoints/pantallas están involucrados.
4. **No asumas que el vault está sincronizado** con el código. Puede haber divergencia. Si la divergencia es material (ej: el vault dice PaddleOCR pero el código usa Ollama), **documenta la divergencia** y propón una resolución.
5. **Después de cambios materiales**, sugiere al humano qué entrada agregar a `log.md` (no la escribas tú directamente sin revisión).
6. **No pegues código del repo en las notas** — solo referencias y resúmenes.
