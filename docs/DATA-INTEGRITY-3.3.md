# Integridad de datos 3.3

Este documento describe cómo Follow Tracker evita interpretar una captura incompleta o un cambio de `username` como un `unfollow` real.

## Problema que resuelve

Una comparación ingenua aplica esta regla:

```text
estaba antes + no aparece ahora = dejó de seguir
```

Esa regla no es segura. Una cuenta puede no aparecer porque:

- Instagram dejó de entregar páginas antes de terminar;
- la lista visual dejó de cargar nuevas filas;
- faltó una parte de la exportación oficial;
- un registro era inválido o estaba duplicado;
- la persona cambió su `username`;
- el contador visible era abreviado y no representaba un total exacto.

Follow Tracker separa tres conceptos:

1. **Lo observado:** lo que apareció en la captura actual.
2. **La calidad de la captura:** cuánta evidencia existe de que la lista terminó completa.
3. **El cambio confirmado:** lo que puede incorporarse al historial sin inventar eventos.

## Flujo autoritativo

```text
archivo o captura
        ↓
detección de formato
        ↓
normalizador específico
        ↓
usuarios canónicos + métricas
        ↓
resolución de identidades
        ↓
evaluación de cobertura y terminación
        ↓
política de ausencias
        ↓
captura pendiente de revisión
        ↓
commit local + timeline
```

El dashboard no interpreta archivos ni calcula bajas. Consume el snapshot y la proyección autoritativa que salen de este flujo.

## Normalizadores de importación

`follower-imports.js` mantiene un registro de normalizadores. Cada formato tiene su propio detector y parser, pero todos producen la misma estructura interna.

Formatos implementados:

- `instagram-json`: exportaciones JSON oficiales y variantes conocidas;
- `instagram-html`: enlaces de perfiles presentes en exportaciones HTML;
- `csv`: columnas como `username`, `full_name` e identificador;
- `canonical`: partes que ya fueron normalizadas por otro componente.

Cada parte produce:

```js
{
  phase: "followers" | "following" | "unknown",
  format: "instagram-json" | "instagram-html" | "csv" | "canonical",
  users: [],
  metrics: {
    inputRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    duplicateRecords: 0,
    missingUsernameRecords: 0
  },
  completeness: {
    status: "complete" | "probably_complete" | "partial" | "unknown",
    confidence: 0,
    expectedCount: null,
    capturedCount: 0,
    coverage: null,
    paginationCompleted: null
  },
  warnings: []
}
```

Las partes numeradas también se revisan. Por ejemplo, seleccionar `followers_1.json` y `followers_3.json` sin `followers_2.json` marca la importación como parcial.

## Cobertura de captura

La cobertura no se deduce únicamente de que una función haya terminado sin error. Se combinan varias señales:

- cantidad esperada;
- cantidad capturada;
- cobertura `capturado / esperado`;
- registros inválidos;
- duplicados;
- final real de paginación;
- razón de terminación;
- advertencias del recolector;
- confianza declarada por el normalizador.

El estado global usa el estado más débil de `followers` y `following`.

### API de Instagram

El recolector informa:

- páginas leídas;
- reintentos;
- registros recibidos;
- duplicados e inválidos;
- cursor final;
- razón de terminación.

Sólo `end_of_pagination` significa que la paginación terminó normalmente. Límites, cursor repetido o páginas estancadas no habilitan bajas.

### Recorrido visual

El recolector visual sólo considera finalizada una lista cuando alcanza un contador **exacto**.

Un contador como `1.2K` es aproximado. Puede representar más de 1.200 cuentas y, por eso, nunca se usa para declarar que la lista terminó. En ese caso la captura puede conservar presencias nuevas, pero no confirmar ausencias.

## Política de ausencias

La eliminación se decide en `applyAbsencePolicy`.

### Captura confiable

Cuando `canConfirmRemovals` es verdadero:

1. la primera ausencia incrementa el contador y conserva al usuario en el snapshot;
2. la ausencia queda como pendiente;
3. una captura completa posterior puede confirmarla;
4. sólo entonces se genera la baja.

El número de capturas necesarias se controla con `confirmRemovalsAfter`.

### Captura incompleta o desconocida

Cuando `canConfirmRemovals` es falso:

- la persona ausente permanece en el snapshot;
- el contador de ausencia no aumenta;
- un contador pendiente anterior tampoco avanza;
- la ausencia se registra como `deferred`;
- guardar la captura como sospechosa no cambia esta regla.

Por lo tanto, dos capturas parciales consecutivas no pueden convertirse en un `unfollow` confirmado.

## Cambios de `username`

La identidad y el nombre visible no representan el mismo concepto.

### Coincidencia fuerte

Cuando Instagram entrega el mismo identificador estable:

```text
id 123: nombre_viejo → nombre_nuevo
```

Follow Tracker:

- conserva la identidad canónica;
- actualiza `currentUsername`;
- conserva los aliases anteriores;
- registra el rename;
- no crea alta ni baja.

### Coincidencia probable

Cuando no existe un identificador estable, una coincidencia estricta de nombre completo único puede producir un candidato de revisión.

Ese candidato:

- no fusiona definitivamente dos identidades;
- se marca con confianza y razón;
- suprime temporalmente el par falsa alta/falsa baja;
- se conserva en capturas posteriores;
- deja de aplicarse si reaparecen simultáneamente ambos usernames;
- queda visible para una corrección manual de identidad.

Esta política privilegia no corromper el historial. Una coincidencia débil nunca se convierte silenciosamente en una unión permanente.

## Almacenamiento versionado

El almacenamiento raíz usa:

```js
{
  schemaVersion: 2,
  previousVersion: 1,
  migratedAt: "...",
  migrationId: "...",
  appVersion: "..."
}
```

Claves principales:

- `ft_storage_meta`: versión y última migración;
- `ft_storage_migration_backup`: respaldo verificable anterior a la migración;
- `ft_settings`: configuración normalizada;
- claves por perfil para snapshot, timeline, identidades, ausencias y metadatos.

### Secuencia de migración

1. leer todo el almacenamiento;
2. detectar la versión real;
3. rechazar versiones futuras desconocidas;
4. calcular las claves que se modificarán;
5. crear un backup con checksum;
6. aplicar actualizaciones y eliminaciones;
7. validar snapshots y metadatos;
8. escribir la versión raíz;
9. restaurar automáticamente el backup ante cualquier fallo.

La restauración también está expuesta para recuperación manual y sólo modifica las claves tocadas por la migración.

## Permisos de la extensión

Permisos anteriores:

```json
["activeTab", "storage", "scripting", "unlimitedStorage"]
```

Permisos actuales:

```json
["activeTab", "storage"]
```

Los scripts de contenido se cargan declarativamente sólo en Instagram. Se eliminó la inyección dinámica y, por lo tanto, ya no se necesita `scripting`.

`unlimitedStorage` también fue retirado. La extensión mantiene el historial en almacenamiento local normal y conserva las herramientas de backup manual.

Los hosts siguen limitados a:

```text
https://www.instagram.com/*
https://instagram.com/*
```

No se solicitan permisos de cookies, historial, red global, todas las pestañas ni todos los sitios.

## Matriz de seguridad

| Situación | Nuevas presencias | Ausencias | Resultado |
|---|---:|---:|---|
| Captura completa | Sí | Avanzan según política | Puede confirmar cambios |
| Captura parcial | Sí | Congeladas | No produce bajas |
| Cobertura desconocida | Sí | Congeladas | Requiere revisión |
| Paginación detenida | Sí | Congeladas | Requiere revisión |
| Rename con ID estable | Misma identidad | Ninguna baja | Rename confirmado |
| Rename probable sin ID | Suprimida | Suprimida | Revisión manual |
| Partes numeradas faltantes | Sí | Congeladas | Importación parcial |
| Migración inválida | No aplica | No aplica | Rollback automático |

## Criterios de aceptación automatizados

Las pruebas cubren:

- JSON, HTML y CSV normalizados por rutas separadas;
- duplicados y registros inválidos;
- partes numeradas faltantes;
- dos capturas parciales sin `unfollow`;
- dos capturas completas para confirmar una baja;
- rename estable sin falsa alta/baja;
- candidato de rename persistente entre capturas;
- contadores visuales abreviados no exactos;
- migración con backup y checksum;
- restauración manual;
- rollback automático;
- rechazo de versiones futuras;
- ausencia de inyección dinámica y permisos excesivos.

## Regla operativa

Una captura puede aportar datos sin tener autoridad para eliminar datos.

Esa separación es la garantía principal de esta versión:

```text
ver una presencia es evidencia positiva;
no ver una cuenta sólo es evidencia de baja cuando la captura es completa.
```
