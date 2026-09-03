# Changelog

Todos los cambios relevantes de Follow Tracker se documentan aquí.

## Sin publicar — 2026-09-01

### Integridad de capturas

- Se separaron normalizadores para importaciones canónicas, JSON de Instagram, HTML y CSV.
- Cada parte importada registra formato, registros recibidos, válidos, inválidos, duplicados y campos sin username.
- Las capturas guardan cobertura, confianza, final de paginación y razón de terminación por lista.
- Una captura parcial o de cobertura desconocida conserva las ausencias como no verificadas y nunca avanza el contador de baja.
- Los contadores visuales abreviados, como `1.2K`, ya no se interpretan como totales exactos.
- Las partes numeradas faltantes se detectan antes de crear un reporte oficial.

### Cambios de username

- El registro de identidad conserva el username actual, los aliases previos y la primera y última observación de la identidad.
- Los cambios confirmados por ID estable no crean altas ni bajas.
- Los posibles cambios sin ID estable quedan como candidatos de revisión, se excluyen temporalmente de altas y bajas y persisten entre capturas sin fusionar cuentas automáticamente.

### Almacenamiento y permisos

- Se agregó una versión raíz del almacenamiento con migraciones incrementales.
- Cada migración crea un backup local con checksum, valida el resultado y hace rollback automático si falla.
- Se rechazan versiones futuras desconocidas en vez de interpretarlas como datos actuales.
- Se eliminaron los permisos `scripting` y `unlimitedStorage`.
- El runtime usa content scripts declarativos limitados a Instagram y solicita únicamente `activeTab` y `storage`.
- Se actualizaron la política de privacidad, la ficha para tiendas, las pruebas y los quality gates.

### Modelo canónico de seguidores

- Se agregó `FollowTrackerFollowerDomain`, dividido en módulos pequeños para identidad, importaciones, relaciones, historial y proyecciones, como única capa de verdad para snapshots, diff y categorías derivadas.
- `core-facade.js`, `history-facade.js` y `relationship-core.js` mantienen las APIs anteriores; `core.js` e `history.js` quedaron como bootstraps locales para las páginas existentes.
- La captura y la importación oficial usan el mismo normalizador mediante `trust-domain-adapter.js`, sin duplicar reglas en `capture-store.js` ni en Administrar.
- Las comparaciones incluyen transiciones persona por persona, deltas de categorías y contadores coherentes para filtros.
- Se agregó una proyección lista para UI, evitando que el dashboard vuelva a inferir relaciones.
- Se corrigió la compatibilidad de `transitionHeadline` usada por el dashboard 3.1.
- Se incorporaron pruebas y quality gates para impedir motores de diff duplicados en la UI, en captura y en fachadas de compatibilidad.
- Los snapshots, timelines, claves locales y backups anteriores permanecen compatibles.

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
