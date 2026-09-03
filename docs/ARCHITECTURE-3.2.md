# Arquitectura 3.2 — dominio canónico de seguidores

Fecha: 2026-08-31

## Decisión

Follow Tracker adopta un único modelo de dominio para representar capturas, normalizar importaciones, calcular diferencias, mantener el historial y derivar categorías. El dashboard, el popup y los overlays no implementan estas reglas: solamente seleccionan datos, invocan el dominio y presentan sus resultados.

La API pública se expone como `FollowTrackerFollowerDomain`. Internamente está dividida en módulos pequeños para que cada responsabilidad sea testeable y para evitar volver a crear un archivo monolítico.

```text
Instagram API / fallback visual / export oficial
                       │
                       ▼
        follower-identity.js
      identidad y usernames canónicos
                       │
                       ▼
         follower-imports.js
   importaciones + contrato de snapshot
                       │
                       ▼
        follower-relations.js
    diff + categorías + transiciones
                       │
                       ▼
    follower-history-model.js
       esquema timeline/report/event
                       │
                       ▼
    follower-history-engine.js
 append / reconstrucción / comparación
                       │
                       ▼
      follower-projections.js
  modelos listos para dashboard y CSV
                       │
                       ▼
       UI: formato, orden y eventos
```

## Responsabilidades

### `follower-identity.js`

Contiene las reglas base:

- normalización de perfil y username;
- normalización del ID estable de Instagram;
- deduplicación de usuarios;
- claves de identidad;
- constantes de snapshots, timelines, eventos y relaciones.

No conoce almacenamiento, Chrome, DOM ni componentes visuales.

### `follower-imports.js`

Interpreta entradas externas y produce snapshots canónicos:

- `parseInstagramExportPart(name, payload)`;
- `mergeInstagramExportParts(parts)`;
- `normalizeSnapshot(snapshot)`;
- `createSnapshot(input)`;
- `diffLists(previous, current)` como operación básica de conjuntos.

La importación puede recibir partes ya parseadas o `{ name, payload }`. Esto permite que Administrar entregue archivos crudos sin duplicar el parser.

### `follower-relations.js`

Es el motor de relaciones:

- `deriveCategories(snapshot)`;
- `diffSnapshots(previous, current)`;
- `buildTransitions(comparison)`;
- textos, tonos, prioridades y selectores de transición.

Los contadores de filtros salen del mismo conjunto de transiciones que la tabla. Así se evita que una tarjeta diga una cifra y la lista muestre otra.

### `follower-history-model.js`

Define y normaliza:

- baseline;
- reportes;
- cambios;
- eventos;
- timeline.

Conserva el formato compatible de `schemaVersion: 2` para timelines existentes.

### `follower-history-engine.js`

Aplica las transiciones de estado:

- agrega snapshots de forma idempotente;
- genera eventos desde el diff canónico;
- reconstruye un snapshot de cualquier reporte;
- compara reportes no consecutivos;
- compacta historiales extensos reubicando el baseline.

### `follower-projections.js`

Produce resultados listos para presentar:

- resumen del snapshot;
- índice de personas actual e histórico;
- filtros de personas;
- proyección completa del dashboard;
- CSV de actividad y relaciones.

Una proyección no modifica el dominio ni persiste nada.

## Contrato de snapshot

Un snapshot normalizado mantiene los metadatos conocidos y garantiza:

```js
{
  schemaVersion: 3,
  profile: "perfil_normalizado",
  profileId: "123456",
  followers: ["ana", "beto"],
  following: ["ana", "carla"],
  updatedAt: "2026-08-31T00:00:00.000Z",
  runId: "run-...",
  reportId: "run-..."
}
```

Invariantes:

1. `profile` es seguro para claves locales.
2. `followers` y `following` están ordenados y sin duplicados.
3. Mayúsculas y minúsculas no crean personas distintas.
4. `@ana`, una URL de Instagram y `{ username: "ana" }` convergen al mismo username.
5. Los snapshots heredados se normalizan al leerlos; no requieren migración destructiva.
6. Las reglas de identidad estable continúan en el registro lateral `ft_identity_*` y alimentan el snapshot con usernames canónicos.

## Normalización de importaciones

`parseInstagramExportPart` clasifica cada archivo como `followers`, `following` o `unknown` y extrae usuarios de las variantes conocidas de la descarga oficial.

`mergeInstagramExportParts`:

- combina archivos divididos como `followers_1.json` y `followers_2.json`;
- deduplica antes de crear el snapshot;
- conserva advertencias;
- diferencia una lista reconocida pero vacía de un archivo no reconocido;
- considera completa la importación cuando están presentes ambas listas.

La importación no decide quién es mutuo ni inventa eventos. Entra al mismo pipeline que las capturas por API y por interfaz visual.

## Motor de diff

`diffSnapshots(previous, current)` es la operación canónica y devuelve:

- seguidores agregados, removidos, sin cambios y delta;
- seguidos agregados, removidos, sin cambios y delta;
- los nombres compatibles `newFollowers`, `lostFollowers`, `newFollowing`, `lostFollowing`;
- categorías anteriores y actuales;
- delta de categorías;
- transición persona por persona;
- contadores para filtros.

`core-facade.js` mantiene `Core.compareSnapshots` para módulos antiguos, pero delega a `Domain.diffLists`. No existe un segundo algoritmo.

## Categorías derivadas

| Categoría | Regla |
|---|---|
| `mutual` | te sigue y lo seguís |
| `follows_you` | te sigue y no lo seguís |
| `you_follow` | lo seguís y no te sigue |
| `historical` | ya no está en ninguna lista, pero conserva eventos |

`deriveCategories(snapshot)` calcula el estado actual. `buildPeopleIndex(snapshot, timeline)` solamente añade la dimensión histórica y los eventos; no redefine la relación.

## Historial

Reglas principales:

1. El primer reporte crea el baseline y no inventa eventos.
2. Un `runId` repetido no duplica reportes ni actividad.
3. Cada reporte guarda el diff respecto a la captura anterior aceptada.
4. Los eventos nacen de ese mismo diff.
5. `snapshotForReport` reconstruye cualquier fecha desde baseline + cambios.
6. `compareReports` reconstruye ambos snapshots y ejecuta `diffSnapshots`.
7. La compactación conserva hasta 400 reportes y crea un nuevo baseline seguro.

`history-guard.js` y `history-quality.js` continúan envolviendo la fachada `FollowTrackerHistory`, por lo que mantienen auditoría, orden cronológico y calidad sin duplicar el modelo.

## Fachadas de compatibilidad

### `core.js` y `core-facade.js`

`core.js` es el bootstrap para páginas internas. Carga módulos locales y luego `core-facade.js`. En Node, exporta la fachada directamente.

La fachada conserva utilidades históricas usadas por API, popup y pruebas, pero dirige normalización, diff y categorías al dominio.

### `history.js` y `history-facade.js`

`history.js` carga modelo, motor, proyecciones y fachada. `history-facade.js` conserva las funciones que consumen dashboard, mantenimiento, backup y auditoría.

### `relationship-core.js`

Conserva la API de transiciones usada por el dashboard y delega todo a `follower-relations.js`. También mantiene el alias global `transitionHeadline` requerido por el dashboard 3.1.

### `trust-domain-adapter.js`

`trust-core.js` conserva reglas de identidad, cobertura, ausencias y revisión. El adapter reemplaza sus antiguos normalizadores y parser de importaciones por las funciones del dominio canónico.

Esto permite migración gradual sin romper `capture-store.js`, `dashboard-admin.js` ni backups existentes.

## Regla de presentación

La UI puede:

- seleccionar perfil y reportes;
- enviar texto de búsqueda y filtros;
- ordenar, paginar y formatear filas ya derivadas;
- dibujar gráficos;
- disparar acciones explícitas del usuario.

La UI no puede:

- comparar arrays de seguidores;
- inferir quién sigue a quién;
- reconstruir snapshots;
- crear eventos;
- interpretar exportaciones oficiales;
- decidir categorías.

`buildDashboardProjection(snapshot, timeline, options)` entrega resumen, categorías, reportes, cambios recientes, personas, actividad y comparación predeterminada. `selectPeople` y `selectTransitions` aplican filtros usando las mismas reglas que sus contadores.

## Orden de carga

### Content script

```text
follower-identity
→ follower-imports
→ follower-relations
→ core-facade
→ trust-core
→ trust-domain-adapter
→ capture-store
→ recolectores/controlador
```

### Service worker

Carga explícitamente el dominio completo, la fachada de historial y luego auditoría/calidad.

### Dashboard y popup

Los tags históricos `core.js` y `history.js` permanecen estables. Sus bootstraps insertan únicamente scripts locales y síncronos antes de ejecutar la UI.

## Compatibilidad de datos

No cambian las claves locales:

```text
ft_history_<perfil>
ft_timeline_<perfil>
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

Tampoco se agrega backend, cuenta remota ni telemetría. Los backups 2.x/3.0 siguen normalizándose al leerlos.

## Protección arquitectónica

La decisión queda protegida mediante:

- pruebas de normalización, importaciones divididas, snapshots, diff, categorías, historial, reconstrucción y proyecciones;
- pruebas de compatibilidad de `Core`, `History`, `Relationship` y `Trust`;
- pruebas de staging, identidad estable y bajas pendientes;
- quality gates que impiden DOM o persistencia dentro del dominio;
- quality gates que rechazan un diff propio en `capture-store.js` o `dashboard.js`;
- validación del orden de carga en Manifest V3 y service worker.

## Próximos pasos seguros

1. Hacer que `dashboard.js` reciba `buildDashboardProjection` como único objeto de entrada y reducir todavía más su estado temporal.
2. Migrar llamadas antiguas de `Trust.parseInstagramExportPart` al namespace de dominio; conservar el adapter mientras existan backups o extensiones instaladas en 3.0.
3. Sustituir los bootstraps por un bundling local cuando exista una herramienta de build estable, sin cambiar la API pública.
