# ADR-002 — Runtime extensible del dashboard

- **Estado:** aceptado
- **Fecha:** 2026-08-24
- **Contexto:** Follow Tracker 3.0

## Contexto

El dashboard comenzó como un archivo único y luego incorporó módulos por encima de funciones globales existentes. Algunos módulos hacían operaciones como:

```js
const previous = renderAll;
renderAll = function () {
  previous();
  renderFeature();
};
```

Otros reemplazaban `loadProfile`, `validView`, `renderPeople`, `renderActivity` o `renderRelationshipList`.

Este enfoque permitió avanzar rápido, pero introdujo problemas:

- el resultado dependía del orden de carga;
- dos módulos podían reemplazar la misma función sin saberlo;
- un error intermedio podía impedir los siguientes renderizados;
- no existía un inventario de extensiones registradas;
- probar una función requería reproducir el encadenamiento completo;
- cada módulo repetía acceso directo a `chrome.storage.local`.

## Decisión

Se introduce `dashboard-runtime.js` con contratos explícitos:

```text
on(evento, handler)
registerRenderer(slot, renderer)
registerView(id)
registerFilter(scope, id, predicate)
render(slot, fallback)
emitSync(evento, payload)
```

El núcleo del dashboard emite eventos de ciclo de vida:

```text
initialized
profile:loaded
render:before
comparison:updated
render:after
view:changed
```

Los módulos dejan de reemplazar funciones globales y se registran en el runtime.

También se introduce `platform-storage.js` como adaptador único para:

```text
get
getAll
set
remove
update
subscribe
```

## Consecuencias positivas

- orden de ejecución visible mediante prioridades;
- errores aislados por extensión;
- renderer especializado sin mutar el núcleo;
- filtros y vistas extensibles mediante contratos;
- menor acoplamiento a Chrome;
- pruebas unitarias sin DOM;
- diagnóstico de extensiones registradas;
- quality gate que evita volver al monkey patching.

## Costos

- se agregan dos módulos de infraestructura;
- los módulos existentes deben migrarse gradualmente;
- la carga inicial sigue siendo secuencial porque Manifest V3 no permite bundling remoto y el proyecto mantiene JavaScript sin build obligatorio.

## Alternativas descartadas

### Convertir todo a framework y bundler

No se adopta todavía porque aumentaría la superficie de migración y no resuelve por sí solo los límites de dominio o almacenamiento.

### Mantener monkey patching documentado

Se descarta porque el orden de carga seguiría siendo una dependencia implícita y difícil de validar.

### Un event bus sin renderers ni filtros

Se consideró insuficiente: reemplazar tablas y extender filtros son necesidades reales del dashboard y merecen contratos de primer nivel.

## Reglas futuras

1. Ningún `dashboard-*.js` puede reasignar funciones del núcleo.
2. Ningún `dashboard-*.js` accede directamente a `chrome.storage.local`.
3. La lógica de decisión debe permanecer en módulos puros.
4. Los nuevos paneles se registran mediante eventos de ciclo de vida.
5. Las nuevas vistas deben registrarse con `registerView`.
6. Los errores de un módulo no deben bloquear el dashboard completo.
