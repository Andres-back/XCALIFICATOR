# Contrato FE/BE - Validacion Rapida

Este flujo evita desalineaciones entre llamadas del frontend y rutas del backend.

## 1. Ejecutar validador de contrato

Desde la carpeta frontend:

```bash
npm run check:api-contract
```

Resultado esperado:

- `Frontend unmatched: 0`
- `Contract check passed.`

## 2. Validar compilacion del frontend

```bash
npm run build
```

Resultado esperado:

- Build completado sin errores.

## 3. Aplicar migracion de horario de materias (entornos existentes)

```bash
Get-Content backend/db/migrations/2026_04_18_materia_encuentros.sql | docker exec -i xcalificator_postgres psql -U xcalificator -d xcalificator_db
```

Si estas en Linux/Mac:

```bash
cat backend/db/migrations/2026_04_18_materia_encuentros.sql | docker exec -i xcalificator_postgres psql -U xcalificator -d xcalificator_db
```

Si prefieres ejecutar manualmente, usa el contenido de:

- `backend/db/migrations/2026_04_18_materia_encuentros.sql`

## Checklist final

- [ ] `npm run check:api-contract` reporta `Frontend unmatched: 0`
- [ ] `npm run build` finaliza sin errores
- [ ] La tabla `materia_encuentros` existe en PostgreSQL
- [ ] Crear materia desde profesor obliga a definir encuentros por semana
- [ ] En asistencia, guardar fecha fuera del horario devuelve error de negocio
