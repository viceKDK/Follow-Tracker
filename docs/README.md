# Documentación de Follow Tracker

Esta carpeta reúne capturas, migraciones, arquitectura y controles de calidad del producto.

## Producto 3.0

- `MIGRATION-3.0.md`: actualización desde historiales 2.x, claves nuevas y cambios del flujo de guardado.
- `ARCHITECTURE-3.0.md`: módulos de captura, identidad, administración y distribución.
- `RECOVERY.md`: deshacer el último reporte y restaurarlo de forma segura.
- `FINAL-QA.md`: checklist de instalación, capturas, identidad, importación oficial, backups, volumen, accesibilidad y release.

## Frontend

- `screen-overview.png`: resumen y evolución del perfil.
- `screen-relationships.png`: comparación **Antes y ahora**.
- `screen-people.png`: directorio de personas.
- `screen-activity.png`: historial de actividad.
- `screen-admin.png`: importación, backups y administración.
- `dashboard-demo.png`: captura histórica del dashboard anterior.

La pantalla principal sigue siendo **Antes y ahora**, pero la versión 3 agrega:

- revisión de calidad antes de guardar;
- identidad estable ante cambios de username;
- notas, etiquetas y fijados;
- importación oficial;
- administración de perfiles y reportes;
- recordatorio de backup.

## Instalación

- `install-01-download-zip.png`: descarga del ZIP desde GitHub.
- `install-02-extract.png`: extracción del archivo descargado.
- `install-03-load.png`: activación del modo desarrollador y carga de `extension/`.
- `install-04-pin.png`: fijar el icono de Follow Tracker.
- `install-guide.html`: fuente reproducible de las ilustraciones de instalación.

Ejecutá `npm run capture:readme` para regenerar todas las capturas con dimensiones fijas y sin recortes manuales.

## Flujo de uso

- `usage-01-popup.png`: perfil detectado en el popup de la extensión.
- `usage-02-analysis-running.png`: recopilación de seguidores y seguidos en curso.
- `usage-03-review.png`: revisión de cobertura y calidad antes de guardar.
- `usage-04-saved.png`: confirmación del reporte guardado.

Estas capturas ejecutan la interfaz real de la extensión sobre la página pública real de `@ellisbah1` en Instagram. Las relaciones devueltas durante la demostración son datos locales ficticios: así el proceso es reproducible y no expone listas ni credenciales de ninguna cuenta.

## Captura heredada

Las imágenes siguientes corresponden al flujo anterior y se conservan como referencia histórica:

- `05-overlay.png`;
- `07-profile-open.png`;
- `08-analysis-running.png`;
- `09-analysis-finished.png`.

La versión 3 utiliza un panel nuevo con revisión antes de guardar; el flujo vigente está documentado en las imágenes `usage-*`.

Todas las cuentas y cifras utilizadas en la documentación son ficticias.
