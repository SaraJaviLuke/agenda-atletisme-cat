# Agenda Atletisme CAT

Web pública con las competiciones de la [Federació Catalana d'Atletisme](https://fcatletisme.cat) para **Sub18, Sub20, Sub23 y Absolut**, filtrables por modalidad (Pista Coberta, Aire Lliure, Cros, Ruta, Marxa…).

- **Agenda**: competiciones próximas, con el estado del horario (publicado / pendiente) y los documentos (reglamento, inscritos, resultados).
- **Novedades**: competiciones nuevas, horarios publicados, documentos nuevos y cambios de fecha o lugar.
- **Calendario**: suscripción para Google Calendar / iPhone (`cal/*.ics`).

## Cómo funciona
`scripts/update.mjs` lee la API pública del calendario de la FCA, detecta las categorías por el título y compara con la versión anterior.
GitHub Actions lo ejecuta cada hora (`.github/workflows/update.yml`) y guarda `data/` y `cal/`. GitHub Pages sirve la web.

Ejecutar a mano: `node scripts/update.mjs` (Node 18+). Previsualizar: `python3 -m http.server`.

Web no oficial.
