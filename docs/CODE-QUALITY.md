# Calidad de código en Follow Tracker

## Objetivo

Follow Tracker debe poder cambiar cuando Instagram cambie sin obligar a modificar almacenamiento, reglas de relaciones, dashboard y exportaciones al mismo tiempo.

La calidad no se mide por cantidad de abstracciones, sino por cuatro resultados:

1. un cambio queda localizado;
2. una regla puede probarse sin navegador;
3. una pantalla explica qué hacer y por qué;
4. CI impide que vuelva la deuda ya eliminada.

## Límites arquitectónicos

### Dominio puro

Estos módulos no conocen DOM ni `chrome.storage`:

- `relationship-core.js`;
- `admin-core.js`;
- `product-guidance.js`;
- `trust-core.js`;
- `history.js` y sus guards.

Contienen reglas, decisiones y transformaciones deterministas.

### Plataforma

`platform-storage.js` es el único adaptador compartido para `chrome.storage.local` dentro del frontend. Centraliza errores, lectura total, actualizaciones y suscripciones.

### Orquestación

`dashboard-runtime.js` registra vistas, filtros, renderers y eventos de ciclo de vida. Los plugins colaboran mediante contratos explícitos; no reemplazan funciones globales de otros módulos.

### Presentación

Los módulos `dashboard-*` renderizan y reaccionan a eventos. No deben volver a contener reglas de negocio que puedan expresarse como funciones puras.

## Principios aplicados

- **Responsabilidad única:** cada módulo cambia por una razón principal.
- **Abierto/cerrado:** una nueva vista o filtro se registra en el runtime sin editar el núcleo.
- **Inversión de dependencias:** el dashboard depende del contrato de almacenamiento, no de llamadas directas a Chrome.
- **Separación command/query:** calcular una recomendación no modifica estado; ejecutar su acción sí.
- **Estado explícito:** la captura pendiente, la aceptada y la sospechosa no se confunden.
- **Compatibilidad progresiva:** sidecars 3.x amplían el modelo sin destruir timelines 2.x.

## Barreras automáticas

`npm run quality` verifica:

- ausencia de monkey patches sobre funciones globales del dashboard;
- ausencia de acceso directo a almacenamiento en plugins;
- módulos puros sin DOM o APIs del navegador;
- endpoints de Instagram encapsulados en `instagram-api.js`;
- límites de tamaño para archivos de alto riesgo;
- presencia de los contratos y documentos arquitectónicos.

La CI ejecuta:

```bash
npm ci
npm test
npm run quality
npm run check
npm run e2e:fixture
npm run e2e
npm run package
```

## Regla para futuras funcionalidades

Antes de agregar una función nueva, responder:

1. ¿Qué problema observable del usuario resuelve?
2. ¿Cuál es la evidencia que permite recomendar esa acción?
3. ¿La regla pertenece al dominio, plataforma, orquestación o presentación?
4. ¿Puede probarse sin navegador?
5. ¿Qué invariante automático evita que se rompa después?

Si no existe una respuesta clara, la funcionalidad todavía no está suficientemente definida para entrar al producto.
