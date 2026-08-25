# Arquitectura de Follow Tracker 3.1 — calidad y extensibilidad

## Objetivo

La arquitectura 3.0 separó captura, confianza y persistencia. La revisión 3.1 extiende esa separación al dashboard, que había comenzado a crecer mediante reemplazos de funciones globales.

## Capas

```text
Instagram adapters
  instagram-api.js
  instagram-ui.js
        ↓
Application services
  analysis-controller.js
  capture-store.js
        ↓
Domain
  trust-core.js
  relationship-core.js
  product-guidance.js
  admin-core.js
  history*.js
        ↓
Platform adapters
  platform-storage.js
  background.js
        ↓
Presentation
  dashboard.js
  dashboard-runtime.js
  dashboard-*.js
```

## Nuevos límites

### `platform-storage.js`

Es el único adaptador de almacenamiento usado por módulos del dashboard y por `capture-store.js`.

Ventajas:

- propagación uniforme de `chrome.runtime.lastError`;
- API Promise consistente;
- suscripción desacoplada a cambios;
- tests con un adaptador Chrome simulado;
- menos código duplicado.

### `dashboard-runtime.js`

El dashboard ya no se extiende reasignando funciones globales. Los módulos usan:

```js
Runtime.on("render:after", renderPanel)
Runtime.registerRenderer("people", renderPeopleTable)
Runtime.registerView("admin")
Runtime.registerFilter("people", "watchlist", predicate)
```

Los eventos disponibles son:

```text
initialized
profile:loaded
render:before
comparison:updated
render:after
view:changed
```

### Módulos puros

#### `relationship-core.js`

Concentra estados, titulares, tonos, prioridades y filtros de relaciones. El dashboard deja de duplicar la regla entre tabla, contador y exportación.

#### `admin-core.js`

Concentra detección de perfiles, cálculo de tamaño, reconstrucción cronológica, fusión de metadata y reemplazo de usernames.

#### `product-guidance.js`

Decide el siguiente mejor paso sin depender de DOM, Chrome o almacenamiento. Recibe hechos y devuelve acciones priorizadas.

## Flujo de render

```text
loadProfile
  ↓
profile:loaded
  ↓
render:before
  ↓
render base
  ↓
renderers registrados
  ↓
render:after
```

Un error en un hook se registra, pero no impide que los siguientes módulos continúen.

## Reglas de dependencia

1. Los módulos de dominio no acceden al DOM.
2. Los módulos de dominio no acceden a `chrome.storage`.
3. Solamente `instagram-api.js` construye endpoints internos de Instagram.
4. Los módulos del dashboard usan `platform-storage.js`.
5. Los módulos del dashboard no reemplazan funciones globales.
6. Una extensión de tabla utiliza `registerRenderer`.
7. Una nueva pestaña utiliza `registerView`.
8. Una regla de decisión debe probarse sin navegador.

## Quality gates

`scripts/quality-gates.js` evita regresiones arquitectónicas:

- límites de tamaño en archivos críticos;
- monkey patching de funciones del dashboard;
- acceso directo a storage desde presentación;
- DOM dentro de módulos puros;
- endpoints de Instagram fuera de su adaptador;
- ausencia de documentos y contratos obligatorios.

## Estrategia de evolución

El refactor es incremental. No requiere migrar a framework ni bundler para lograr límites claros. Un cambio futuro puede introducir módulos ES o TypeScript, siempre que conserve los contratos del dominio y no vuelva a mezclar captura, persistencia y presentación.
