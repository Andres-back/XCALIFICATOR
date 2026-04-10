# Flujo Visual xCalificator

Esta carpeta contiene una web estatica para entender el sistema de forma visual.

## Archivos

- index.html: estructura principal de la vista
- styles.css: estilo visual responsive y animaciones
- app.js: datos del sistema + render interactivo

## Uso rapido

1. Abrir index.html en navegador.
2. O usar un servidor local:
   - Python: python -m http.server 8080
   - Node: npx serve .
3. Entrar a http://localhost:8080/ (o puerto del servidor)

## Que incluye

- Mapa de arquitectura runtime.
- Flujos criticos paso a paso (backend + frontend).
- Mapa por rol (admin, profesor, estudiante).
- Mapa de routers/endpoints con buscador.
- Entidades de datos con riesgos por tabla.
- Tablero filtrable de fallos comunes.
- Roadmap de mejoras por horizonte.
- Runbook de diagnostico por sintoma con comandos utiles.
- Guia de impacto para empezar cambios (donde tocar y validar).

## Nota

Solo documenta y visualiza. No modifica backend, frontend ni base de datos.
