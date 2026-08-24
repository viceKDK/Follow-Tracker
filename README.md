<div align="center">

# Follow Tracker

### Seguidores antes y ahora, con revisión de calidad e identidad estable

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-2f6df6?style=for-the-badge&logo=googlechrome&logoColor=white)](#instalación)
[![Version](https://img.shields.io/badge/version-3.0.0-6658d3?style=for-the-badge)](CHANGELOG.md)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-15966d?style=for-the-badge&logo=nodedotjs&logoColor=white)](#desarrollo)
[![License](https://img.shields.io/badge/License-MIT-17213b?style=for-the-badge)](LICENSE)

Extensión privada y local para guardar capturas de seguidores y seguidos, revisar su confiabilidad y comparar cada relación entre dos fechas.

</div>

> [!IMPORTANT]
> Follow Tracker 3 no modifica el historial apenas termina de recolectar. Primero muestra la cobertura, la fuente, las advertencias y los cambios detectados. El usuario decide guardar, guardar como sospechoso o descartar.

> [!NOTE]
> Follow Tracker no está afiliado, patrocinado ni aprobado por Instagram o Meta. Instagram puede cambiar su interfaz o sus endpoints internos; por eso también existe la importación de archivos oficiales.

## Qué problema resuelve

Instagram muestra el estado actual, pero no responde claramente:

- ¿Quién me seguía antes y ahora no?
- ¿A quién sigo y no me sigue?
- ¿Quién empezó a seguirme desde una fecha concreta?
- ¿Con quién antes nos seguíamos mutuamente?
- ¿Una persona dejó de seguirme o solamente cambió su username?
- ¿La lista que entregó Instagram estaba realmente completa?
- ¿Qué cambios quedaron pendientes por falta de evidencia suficiente?

Follow Tracker crea una línea temporal local por perfil y reconstruye el estado de cada persona en cualquier reporte guardado.

## Flujo principal

```text
Abrir un perfil de Instagram
        ↓
Recolectar por API
        ↓ si falla
Recorrer visualmente las listas
        ↓
Resolver identidades y usernames
        ↓
Calcular cobertura y anomalías
        ↓
Mostrar revisión
        ↓
Guardar / guardar como sospechoso / descartar
        ↓
Comparar antes y ahora
```

Hasta que se pulsa **Guardar reporte**, la captura queda en una clave temporal y el historial válido no cambia.

## Revisión antes de guardar

La pantalla de revisión muestra:

- fuente: `api`, `ui` o `instagram_export`;
- seguidores recolectados y contador esperado;
- seguidos recolectados y contador esperado;
- porcentaje de cobertura;
- duración y reintentos;
- cambios detectados;
- caídas inusualmente grandes;
- usernames renombrados;
- bajas pendientes de confirmación;
- puntaje de calidad.

Estados posibles:

| Estado | Significado |
|---|---|
| **Confiable** | La cobertura y los cambios están dentro de los límites configurados |
| **Revisar** | Existe una advertencia, una caída grande o una baja pendiente |
| **Rechazada** | La captura está demasiado incompleta para guardarse normalmente |
| **Sospechosa** | El usuario decidió conservar una captura dudosa para investigarla |
| **Heredada** | El reporte se creó antes de Follow Tracker 3 y no tiene evidencia de calidad |

Una captura rechazada no puede guardarse como normal; solamente puede descartarse o conservarse explícitamente como sospechosa.

## Confirmación de bajas

Por defecto, una cuenta debe faltar en **dos capturas completas consecutivas** antes de convertirse en una baja confirmada.

```text
Reporte 1: @persona aparece
Reporte 2: @persona falta → baja pendiente 1/2
Reporte 3: @persona sigue faltando → baja confirmada
```

Si vuelve a aparecer antes de la segunda captura, la ausencia pendiente se elimina y no se genera un falso unfollow.

La cantidad necesaria puede modificarse en:

```text
Administrar → Reglas de captura
```

## Identidad estable y cambios de username

Cuando la respuesta de Instagram incluye el ID numérico de una cuenta, Follow Tracker lo utiliza como identidad estable.

Ejemplo:

```text
ID 123456
Antes: @nombre_viejo
Ahora: @nombre_nuevo
```

El historial conserva una sola persona:

```text
Identidad canónica: @nombre_viejo
Username actual:    @nombre_nuevo
Alias guardados:    nombre_viejo, nombre_nuevo
```

No se inventa una baja de `@nombre_viejo` y un alta de `@nombre_nuevo`.

Si el cambio no pudo detectarse automáticamente, se puede corregir desde:

```text
Administrar → Identidades → Unir identidad
```

## Dashboard

<p align="center">
  <img src="docs/dashboard-showcase.webp" alt="Pestaña Antes y ahora de Follow Tracker" width="760">
</p>

> Las cuentas, fechas y cifras de las imágenes del repositorio son ficticias.

El dashboard tiene cinco secciones.

### Resumen

Muestra:

- seguidores y seguidos actuales;
- relaciones mutuas;
- personas que solamente te siguen;
- personas que solamente seguís;
- bajas confirmadas del último reporte;
- evolución por fecha;
- calidad de la última captura;
- salud estructural del historial;
- recordatorio de backup;
- recuperación del último reporte.

### Antes y ahora

Elegís un reporte anterior y uno actual. Para cada persona se muestra:

- si te seguía antes;
- si vos la seguías antes;
- si te sigue ahora;
- si vos la seguís ahora;
- estado anterior;
- estado actual;
- explicación exacta del cambio.

Herramientas:

- búsqueda por username;
- filtro por estado actual;
- filtro por tipo de cambio;
- presets último/anterior, hace siete días/ahora y primero/ahora;
- orden por columnas;
- densidad compacta o normal;
- paginación de 100, 250 o 500 filas;
- panel lateral con historial individual;
- exportación CSV de la vista filtrada.

### Personas

Permite consultar:

- relación actual;
- historial de eventos;
- username actual y alias anteriores;
- enlace al perfil;
- notas privadas;
- etiquetas;
- estado fijado.

Filtros:

- todos;
- te dejó de seguir;
- te sigue y no lo seguís;
- lo seguís y no te sigue;
- se siguen;
- ya no se siguen;
- fijados.

### Actividad

Incluye:

- búsqueda por persona o reporte;
- filtro por tipo de evento;
- filtro por reporte;
- rango de fechas;
- paginación de 50, 100, 250 o 500 eventos;
- exportación CSV de las coincidencias.

La fecha es la fecha del reporte que detectó el cambio, no necesariamente el segundo exacto en que ocurrió.

### Administrar

Centraliza el mantenimiento del espacio de trabajo:

- importar JSON oficiales de Instagram;
- etiquetar y archivar perfiles;
- exportar un perfil o todos;
- fusionar perfiles duplicados;
- editar etiqueta, nota y estado de un reporte;
- eliminar cualquier reporte intermedio;
- unir identities/usernames;
- configurar umbrales de calidad;
- configurar cuántas capturas confirman una baja.

## Importar la descarga oficial de Instagram

Desde **Administrar → Importación oficial** se pueden seleccionar archivos como:

```text
followers_1.json
followers_2.json
following.json
```

Follow Tracker:

1. clasifica los archivos;
2. extrae los usernames;
3. combina archivos divididos;
4. muestra una vista previa;
5. crea una captura con fuente `instagram_export`;
6. aplica las mismas reglas de identidad, ausencia y calidad.

Esto funciona como alternativa cuando la API interna o la interfaz de Instagram cambian.

## Administrar perfiles

Para cada perfil se muestra:

- cantidad de reportes;
- personas actuales;
- espacio local estimado;
- etiqueta local;
- estado archivado.

Acciones:

```text
Abrir
Guardar etiqueta
Archivar / desarchivar
Exportar
Eliminar
```

### Fusionar perfiles

Sirve cuando el mismo perfil quedó guardado bajo dos usernames distintos.

La fusión:

- reconstruye snapshots de ambos timelines;
- ordena las capturas por fecha;
- elimina IDs duplicados;
- recalcula los deltas;
- combina identidades, notas y metadatos;
- elimina el perfil de origen.

## Administrar reportes

Cada reporte puede tener:

```text
Etiqueta
Nota breve
Estado de confianza
Fuente
Puntaje
```

También se puede eliminar un reporte intermedio. Follow Tracker no corta el array sin más: reconstruye todos los snapshots restantes y recalcula correctamente los cambios posteriores.

## Notas, etiquetas y fijados

En el panel de una persona se puede guardar:

- una nota privada;
- hasta 12 etiquetas;
- estado fijado.

Ejemplo:

```text
@persona
Fijado: sí
Etiquetas: amistad, trabajo
Nota: "Nos seguimos desde marzo"
```

Todo permanece en el navegador y se incluye en el backup completo.

## Backups

### Backup de un perfil

Incluye:

- snapshot actual;
- línea temporal;
- calidad de cada captura;
- identidades y alias;
- bajas pendientes;
- notas, etiquetas y fijados;
- metadatos del perfil;
- recuperación temporal;
- configuración.

### Backup de todos los perfiles

Desde **Administrar** se puede crear un único archivo de espacio de trabajo con todos los perfiles.

### Recordatorio

El Resumen muestra un aviso cuando:

- nunca se hizo un backup;
- pasaron 30 días;
- existen al menos cinco reportes nuevos desde la última exportación.

Los umbrales se guardan localmente.

## Recuperación

### Deshacer el último reporte

La sección Recuperación permite volver exactamente al reporte anterior. Antes guarda un punto de recuperación de un solo uso.

### Restaurar

Se puede restaurar el reporte deshecho mientras no se haya agregado otro reporte incompatible.

### Eliminar un reporte intermedio

Se realiza desde Administrar y reconstruye toda la línea temporal. Es una operación distinta al rollback rápido del último reporte.

## Exportaciones

Follow Tracker no genera CSV ni XLS automáticamente durante el análisis.

Las exportaciones se producen únicamente por una acción explícita:

- backup JSON completo;
- backup de todos los perfiles;
- actividad CSV;
- relaciones CSV;
- comparación CSV;
- actividad filtrada CSV;
- diagnóstico JSON.

Los CSV neutralizan valores que empiezan con `=`, `+`, `-` o `@` para evitar fórmulas al abrirlos en una planilla.

## Privacidad

- Sin backend propio.
- Sin cuenta de Follow Tracker.
- Sin analytics de seguidores.
- Sin almacenamiento de contraseña.
- Sin follow/unfollow automático.
- Sin mensajes ni publicaciones.
- Datos guardados en `chrome.storage.local`.
- Archivos generados solamente cuando el usuario lo solicita.

Consulta [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md).

## Modelo de almacenamiento

```text
ft_history_<perfil>         última captura aceptada
ft_timeline_<perfil>        línea base, reportes y eventos
ft_capture_meta_<perfil>    fuente, cobertura, puntaje y notas de reportes
ft_identity_<perfil>        IDs estables, username actual y alias
ft_absence_<perfil>         desapariciones pendientes de confirmación
ft_people_meta_<perfil>     fijados, notas y etiquetas
ft_profile_meta_<perfil>    etiqueta, archivo y datos del perfil
ft_backup_status_<perfil>   última exportación conocida
ft_pending_capture_<perfil> captura esperando decisión
ft_recovery_<perfil>        rollback temporal del último reporte
ft_settings                 reglas de captura
```

Los historiales 2.x continúan usando `ft_history_*` y `ft_timeline_*`; la información 3.0 se agrega mediante sidecars compatibles.

## Arquitectura

El antiguo content script monolítico fue reemplazado por módulos separados:

```text
trust-core.js            reglas puras de calidad, identidad e importación
capture-store.js         staging, commit y descarte de capturas
instagram-api.js         sesión, API, paginación y reintentos
instagram-ui.js          fallback visual
analysis-overlay.js      interfaz sobre Instagram
analysis-controller.js   orquestación
content-entry.js         mensajes de la extensión
```

El dashboard se amplía con:

```text
dashboard-backup.js
dashboard-identity.js
dashboard-admin.js
dashboard-trust.css
```

La migración detallada está en [`docs/MIGRATION-3.0.md`](docs/MIGRATION-3.0.md).

## Instalación manual

```bash
git clone https://github.com/viceKDK/Follow-Tracker.git
cd Follow-Tracker
```

1. Abrí `chrome://extensions` o `edge://extensions`.
2. Activá **Modo desarrollador**.
3. Pulsá **Cargar descomprimida**.
4. Seleccioná `extension/`.
5. Fijá el icono de Follow Tracker.

## Uso

1. Iniciá sesión en Instagram.
2. Abrí `instagram.com/usuario/`.
3. Pulsá Follow Tracker.
4. Elegí **Analizar perfil actual**.
5. Dejá la pestaña abierta mientras carga.
6. Revisá la cobertura y los cambios.
7. Guardá o descartá.
8. Abrí **Antes y ahora** para comparar.
9. Descargá un backup cuando quieras conservar el espacio de trabajo.

## Limitaciones

Instagram puede:

- responder con `429`, `502`, `503` o `504`;
- ocultar cuentas suspendidas o no disponibles;
- entregar contadores y listas temporalmente desalineados;
- cambiar endpoints;
- cambiar su DOM;
- limitar cuentas privadas.

Follow Tracker reduce el riesgo mediante:

- reintentos y backoff;
- fallback visual;
- revisión previa;
- umbrales de cobertura;
- confirmación en más de una captura;
- IDs estables;
- importación oficial;
- rollback y backups.

No puede garantizar el instante exacto de un follow/unfollow ni que Instagram mantenga indefinidamente sus interfaces internas.

## Desarrollo

Requisitos:

- Node.js 20 o superior;
- Chromium para Playwright.

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run e2e:fixture
npm run e2e
npm run package
```

`npm run package` genera:

```text
dist/follow-tracker-3.0.0.zip
dist/follow-tracker-3.0.0.zip.sha256
dist/release-manifest.json
```

Los tags `v*` ejecutan el workflow de release y publican esos archivos en GitHub Releases.

## Documentación de distribución

- [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md)
- [`STORE_LISTING.md`](STORE_LISTING.md)
- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/MIGRATION-3.0.md`](docs/MIGRATION-3.0.md)
- [`docs/FINAL-QA.md`](docs/FINAL-QA.md)
- [`docs/RECOVERY.md`](docs/RECOVERY.md)

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
