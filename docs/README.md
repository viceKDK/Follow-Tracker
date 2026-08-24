# Documentación de Follow Tracker

Esta carpeta reúne capturas, migraciones, arquitectura y controles de calidad del producto.

## Producto 3.0

- `MIGRATION-3.0.md`: actualización desde historiales 2.x, claves nuevas y cambios del flujo de guardado.
- `ARCHITECTURE-3.0.md`: módulos de captura, identidad, administración y distribución.
- `RECOVERY.md`: deshacer el último reporte y restaurarlo de forma segura.
- `FINAL-QA.md`: checklist de instalación, capturas, identidad, importación oficial, backups, volumen, accesibilidad y release.

## Frontend

- `dashboard-showcase.webp`: captura principal de **Antes y ahora**.
- `dashboard-demo.png`: captura histórica del dashboard anterior.

La pantalla principal sigue siendo **Antes y ahora**, pero la versión 3 agrega:

- revisión de calidad antes de guardar;
- identidad estable ante cambios de username;
- notas, etiquetas y fijados;
- importación oficial;
- administración de perfiles y reportes;
- recordatorio de backup.

## Instalación

- `01-extensions.png`: página de extensiones.
- `02-dev-mode.png`: activación del modo desarrollador.
- `03-load-unpacked.png`: carga de la carpeta `extension/`.
- `04-pin-icon.png`: fijar el icono de Follow Tracker.

## Captura heredada

Las imágenes siguientes corresponden al flujo anterior y se conservan como referencia histórica:

- `05-overlay.png`;
- `07-profile-open.png`;
- `08-analysis-running.png`;
- `09-analysis-finished.png`.

La versión 3 utiliza un panel nuevo con revisión antes de guardar. Las capturas finales para tiendas deben actualizarse antes de publicar la extensión.

Todas las cuentas y cifras utilizadas en la documentación son ficticias.
