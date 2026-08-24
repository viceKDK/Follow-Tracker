# Arquitectura de Follow Tracker 3.0

## Objetivo

La versión 3 separa tres responsabilidades que antes estaban mezcladas:

1. obtener datos desde Instagram;
2. decidir si la captura es suficientemente confiable;
3. guardar y presentar el historial.

Ningún recolector escribe directamente en `ft_history_*`.

## Flujo de captura

```text
content-entry.js
      ↓
analysis-controller.js
      ↓
instagram-api.js ──────┐
      ↓ fallback       │
instagram-ui.js        │
      └────────────────┘
      ↓
capture-store.js
      ↓
trust-core.js
      ↓
analysis-overlay.js
      ↓ decisión
commit / suspicious / discard
```

## Módulos

### `trust-core.js`

Código puro sin dependencia del DOM.

Responsabilidades:

- normalizar usernames e IDs;
- mantener el registro de identidad;
- detectar cambios de username;
- aplicar confirmación de ausencias;
- calcular cobertura y puntaje;
- clasificar capturas;
- interpretar archivos oficiales;
- reconstruir un timeline sin un reporte intermedio;
- calcular recordatorios de backup;
- centralizar claves laterales de almacenamiento.

Debe permanecer testeable desde Node.

### `capture-store.js`

Puerta única de persistencia para capturas nuevas.

```text
stageCapture()
commitStage()
discardStage()
```

`stageCapture()` puede escribir solamente la captura pendiente. No modifica la última captura aceptada.

`commitStage()` escribe:

- snapshot;
- evidencia de calidad;
- identidad;
- ausencias pendientes;
- metadatos del perfil.

La línea temporal continúa siendo generada por el service worker al observar el cambio del snapshot.

### `instagram-api.js`

Encapsula:

- cookies visibles;
- headers de Instagram;
- perfil y contador esperado;
- paginación de followers/following;
- IDs numéricos;
- timeout;
- backoff;
- cancelación;
- progreso.

El resto de la extensión no debería construir URLs de la API interna.

### `instagram-ui.js`

Fallback desacoplado de la API.

Encapsula:

- localizar el botón de la lista;
- abrir diálogo o ruta;
- detectar contadores visibles;
- localizar el contenedor de scroll;
- extraer filas visibles;
- cerrar y volver al perfil.

Cuando cambia el DOM de Instagram, este módulo puede reemplazarse sin tocar almacenamiento o dashboard.

### `analysis-overlay.js`

Único responsable de la UI dentro de Instagram.

No conoce claves de almacenamiento. Recibe estado y devuelve una decisión:

```text
save
save_suspicious
discard
```

### `analysis-controller.js`

Orquesta una ejecución:

- valida el perfil;
- intenta API;
- activa fallback visual;
- crea la captura pendiente;
- solicita revisión;
- confirma o descarta;
- informa al service worker.

### `content-entry.js`

Entrada mínima del content runtime.

Expone mensajes:

```text
PING
SHOW_OVERLAY
START_ANALYSIS
CANCEL_ANALYSIS
```

También reabre una captura pendiente tras recargar la página.

## Service worker

`background.js`:

- migra almacenamiento 2.x;
- inyecta el runtime modular si hace falta;
- inicia/cancela el análisis;
- convierte snapshots aceptados en reportes;
- abre el dashboard después de guardar;
- administra el badge.

El worker nunca ejecuta scraping.

## Dashboard

### Núcleo existente

```text
dashboard.js
history.js
product-core.js
```

Conserva la compatibilidad con snapshots y timelines 2.x.

### Extensiones

```text
dashboard-ux.js           tablas, filtros y panel individual
dashboard-product.js      actividad, importación heredada y salud
dashboard-maintenance.js  rollback del último reporte
dashboard-backup.js       backup completo y recordatorio
dashboard-identity.js     aliases, notas, etiquetas y fijados
dashboard-admin.js        administración e importación oficial
dashboard-trust.css       estilos 3.0
```

`dashboard-table.js` carga los módulos en un orden explícito.

## Persistencia

### Compatibilidad base

```text
ft_history_<perfil>
ft_timeline_<perfil>
```

### Sidecars 3.0

```text
ft_capture_meta_<perfil>
ft_identity_<perfil>
ft_absence_<perfil>
ft_people_meta_<perfil>
ft_profile_meta_<perfil>
ft_backup_status_<perfil>
ft_pending_capture_<perfil>
ft_recovery_<perfil>
ft_settings
```

Los sidecars evitan migrar destructivamente el timeline 2.x.

## Invariantes

1. Una captura pendiente no modifica el historial aceptado.
2. Una captura parcial no produce bajas confirmadas automáticamente.
3. El ID de Instagram prevalece sobre el username cuando existe.
4. El username canónico no cambia por una renombrada automática.
5. El username actual se utiliza para abrir Instagram.
6. Un reporte intermedio solo se elimina reconstruyendo el timeline.
7. Las exportaciones requieren una acción del usuario.
8. No se carga código remoto.
9. Los módulos de captura no realizan follow, unfollow, mensajes o publicaciones.
10. Todo dato nuevo debe incluirse en el backup completo.

## Distribución

`npm run package`:

1. valida Manifest V3 y referencias locales;
2. excluye tests;
3. crea un ZIP reproducible;
4. calcula SHA-256;
5. genera `release-manifest.json`.

Los tags `v*` ejecutan `.github/workflows/release.yml`.

## Estrategia de mantenimiento

Cuando Instagram cambia:

- endpoint o paginación → modificar `instagram-api.js`;
- DOM o scroll → modificar `instagram-ui.js`;
- criterio de confianza → modificar `trust-core.js`;
- formato de backup → modificar `dashboard-backup.js` y migración;
- presentación → modificar módulos del dashboard.

No debe volver a introducirse lógica de exportación, almacenamiento o comparación dentro del recolector.
