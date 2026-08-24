# Changelog

Todos los cambios relevantes de Follow Tracker se documentan aquí.

## 3.0.0 — 2026-08-24

### Capturas confiables

- Se reemplazó el content script monolítico por módulos separados para API, fallback visual, revisión, almacenamiento y control.
- Cada análisis queda pendiente hasta que el usuario revisa cobertura, fuente, advertencias y cambios.
- Las capturas demasiado incompletas se rechazan por defecto.
- Las capturas dudosas pueden guardarse explícitamente como sospechosas.
- Las bajas pueden requerir dos capturas completas consecutivas antes de convertirse en un unfollow confirmado.
- Se guardan metadatos de cobertura, duración, reintentos, fuente y decisión de revisión.

### Identidad estable

- Se incorporó un registro local de identidades basado en el ID numérico de Instagram cuando está disponible.
- Un cambio de username ya no crea automáticamente una baja y un alta para la misma cuenta.
- El dashboard muestra el username actual y conserva los alias anteriores.
- Se agregó una herramienta manual para fusionar identidades.

### Importación oficial

- Se pueden seleccionar `followers_1.json`, `following.json` y variantes de la descarga oficial de Instagram.
- La importación se previsualiza y se guarda como una captura con fuente `instagram_export`.

### Administración

- Nueva pestaña Administrar.
- Etiquetas locales y archivo de perfiles.
- Exportación individual o conjunta de perfiles.
- Fusión de perfiles duplicados.
- Edición de etiqueta, nota y estado de calidad por reporte.
- Eliminación de cualquier reporte mediante reconstrucción segura de la línea temporal.
- Configuración de umbrales de cobertura, caída y confirmación de bajas.

### Personas

- Personas fijadas.
- Notas privadas.
- Etiquetas locales.
- Filtro de fijados.

### Backups y distribución

- Backup completo con identidades, notas, metadatos y configuración.
- Restauración de backups 3.0 y compatibilidad con formatos anteriores.
- Recordatorio local de backup.
- Política de privacidad y ficha para tiendas.
- Comando `npm run package` para producir ZIP, SHA-256 y manifest de release.
- Workflow de release para tags `v*`.

### Eliminado

- Generación automática de CSV y XLS durante el análisis.
- Interceptación de descargas heredadas.
- Content script monolítico de aproximadamente 80 KB.

## 2.1.0 — 2026-08-24

- Paginación de tablas grandes.
- Filtros avanzados de actividad y relaciones.
- Importación de backup JSON.
- Salud del historial.
- Recuperación del último reporte.
- Exportaciones únicamente desde el dashboard.

## 2.0.0

- Línea temporal local por perfil.
- Comparación entre dos reportes.
- Personas y actividad histórica.
- Dashboard Antes y ahora.
