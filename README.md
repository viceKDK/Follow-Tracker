<div align="center">

# Follow Tracker

### Compará seguidores y seguidos entre dos fechas, persona por persona

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-2f6df6?style=for-the-badge&logo=googlechrome&logoColor=white)](#instalación)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-15966d?style=for-the-badge&logo=nodedotjs&logoColor=white)](#desarrollo)
[![License](https://img.shields.io/badge/License-MIT-17213b?style=for-the-badge)](LICENSE)

Extensión de navegador privada y local para guardar reportes de Instagram y ver cómo estaba cada relación antes y cómo está ahora.

</div>

> [!IMPORTANT]
> El valor principal de Follow Tracker no es contar seguidores. Es comparar dos capturas completas y explicar, para cada persona, si te seguía, si la seguías, qué relación existe ahora y qué cambió entre ambas fechas.

> [!NOTE]
> Follow Tracker no está afiliado con Instagram ni Meta. Funciona sobre la sesión abierta en el navegador y puede necesitar mantenimiento cuando Instagram modifica su interfaz o sus endpoints internos.

## Qué resuelve

Instagram muestra el estado actual, pero no conserva para vos una respuesta clara a preguntas como:

- ¿Quién me seguía antes y ahora me dejó de seguir?
- ¿A quién sigo yo pero no me sigue?
- ¿Quién empezó a seguirme desde el último reporte?
- ¿Con quién antes nos seguíamos y ahora ya no?
- ¿Cuándo apareció un cambio en mis análisis?
- ¿Qué cambió entre dos reportes no consecutivos?

Follow Tracker crea una línea temporal local por perfil y reconstruye el estado de cada persona en cualquier reporte guardado.

## Frontend

<p align="center">
  <img src="docs/dashboard-showcase.webp" alt="Pestaña Antes y ahora de Follow Tracker, con la relación anterior y actual de cada persona" width="760">
</p>

> Todas las cuentas, fechas y cifras de las capturas del repositorio son ficticias.

El dashboard se divide en cuatro pestañas:

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | Totales actuales, cambios del último reporte, evolución y salud del historial |
| **Antes y ahora** | Comparación detallada entre dos reportes, con una fila por persona |
| **Personas** | Estado actual e historial individual de cada usuario |
| **Actividad** | Todos los cambios detectados, con búsqueda, filtros y paginación |

## Antes y ahora

Esta es la pantalla principal del producto.

Seleccionás:

1. un **reporte anterior**;
2. un **reporte actual**.

La aplicación reconstruye ambas capturas y compara las listas completas. Para cada persona muestra:

- si te seguía antes;
- si vos la seguías antes;
- si te sigue ahora;
- si vos la seguís ahora;
- el estado anterior;
- el estado actual;
- una frase clara que explica qué pasó.

### Estados actuales

| Estado | Significado |
|---|---|
| **Se siguen** | Vos lo seguís y esa persona también te sigue |
| **Te sigue; no lo seguís** | Esa persona te sigue, pero vos no la seguís |
| **Lo seguís; no te sigue** | Vos seguís a esa persona, pero ella no te sigue |
| **No se siguen** | Ninguno sigue al otro en el reporte elegido |

### Cambios entre reportes

| Mensaje | Qué significa |
|---|---|
| **Te sigue ahora** | En el reporte anterior no te seguía y en el actual sí |
| **Te dejó de seguir** | En el reporte anterior te seguía y en el actual no |
| **Te dejó de seguir; vos todavía lo seguís** | Antes se seguían y ahora solamente vos lo seguís |
| **Lo seguís ahora** | Antes no lo seguías y ahora sí |
| **Lo dejaste de seguir** | Antes lo seguías y ahora no |
| **Lo dejaste de seguir; todavía te sigue** | Antes se seguían y ahora solamente esa persona te sigue |
| **Se siguen ahora** | Antes no se seguían en ambos sentidos y ahora sí |
| **Se dejaron de seguir** | Antes se seguían y ahora ninguno sigue al otro |

### Herramientas de comparación

- búsqueda por usuario;
- filtros rápidos por cambio;
- filtro por estado actual;
- filtro por tipo exacto de cambio;
- orden por usuario, estado o prioridad;
- presets **último vs anterior**, **hace 7 días vs ahora** y **primer reporte vs ahora**;
- tabla compacta o normal;
- panel lateral con el historial individual;
- exportación CSV de la vista filtrada;
- paginación de 100, 250 o 500 filas para mantener el dashboard fluido con listas grandes.

## Resumen

El resumen usa la última captura completa y muestra:

- **Te siguen**: total de seguidores actuales.
- **Seguís**: total de cuentas seguidas actualmente.
- **Se siguen**: relaciones mutuas.
- **Te siguen; no los seguís**: seguidores que no seguís.
- **Los seguís; no te siguen**: cuentas que seguís y no te siguen.
- **Te dejaron de seguir**: bajas detectadas desde el reporte anterior.
- evolución de seguidores y seguidos por reporte;
- grupos de cambios del último análisis.

### Salud del historial

La versión 2.1 agrega un diagnóstico local que revisa:

- que la captura y la línea temporal pertenezcan al mismo perfil;
- que exista la línea base necesaria para reconstruir reportes;
- IDs duplicados de reportes o eventos;
- usuarios duplicados;
- fechas o tipos de evento inválidos;
- diferencias entre los totales de la captura actual y el último reporte.

El panel entrega un puntaje de consistencia y permite descargar un diagnóstico JSON. No sube información a ningún servidor.

## Personas

La pestaña **Personas** permite buscar una cuenta y ver:

- estado actual;
- si te sigue;
- si la seguís;
- cantidad de cambios guardados;
- último cambio detectado;
- fecha y reporte que detectaron el cambio;
- historial individual completo;
- enlace directo al perfil de Instagram.

Filtros disponibles:

- Todos.
- Te dejó de seguir.
- Te sigue; no lo seguís.
- Lo seguís; no te sigue.
- Se siguen.
- Ya no se siguen.

La tabla se pagina para evitar congelamientos con decenas de miles de cuentas.

## Actividad

La pestaña **Actividad** ordena los eventos desde el más reciente y permite filtrar por:

- usuario;
- tipo de cambio;
- reporte;
- fecha desde;
- fecha hasta.

Ejemplo:

```text
@beto te dejó de seguir
24 ago. 2026, 15:30
Reporte r4
```

La fecha indica cuándo un reporte detectó el cambio. La extensión no puede conocer el segundo exacto en el que ocurrió entre dos análisis.

La actividad se pagina en bloques de 50, 100, 250 o 500 filas. La vista filtrada puede exportarse a CSV.

## Cómo funciona

```text
Primer análisis  → crea la línea base
Segundo análisis → compara contra la línea base
Nuevos análisis  → amplían el historial
Dos reportes      → permiten reconstruir el antes y el ahora
```

Una captura incompleta no reemplaza el historial válido ni genera falsos unfollows.

El análisis intenta primero obtener las listas mediante la API utilizada por la página. Cuando la cobertura no es suficiente, recurre al recorrido visual de las listas.

## Guardado y exportaciones

Los análisis se guardan en `chrome.storage.local`.

**La extensión no descarga CSV ni Excel automáticamente después de analizar.** Esto evita llenar la carpeta Descargas cada vez que se crea una captura. Los archivos se generan únicamente cuando el usuario los solicita desde el dashboard.

Exportaciones disponibles:

- **Backup JSON**: captura actual y línea temporal completa.
- **Actividad CSV**: persona, evento, fecha, reporte y `run_id`.
- **Relaciones CSV**: estado actual de cada persona.
- **Comparación CSV**: filas visibles según los filtros de Antes y ahora.
- **Actividad filtrada CSV**: eventos que coinciden con los filtros actuales.
- **Diagnóstico JSON**: métricas y observaciones de consistencia.

### Importar backup

El botón **Importar backup** permite restaurar el JSON exportado por Follow Tracker.

Antes de guardar, la extensión valida:

- formato del archivo;
- listas de seguidores y seguidos;
- perfil de la captura;
- estructura de reportes y eventos;
- presencia de la línea base;
- coincidencia entre el perfil de la captura y el de la línea temporal.

También admite una captura heredada que solamente contenga `profile`, `followers` y `following`; en ese caso crea una nueva línea base.

## Privacidad

- No existe un backend propio.
- No se crea una cuenta de Follow Tracker.
- Los datos permanecen en el navegador mediante `chrome.storage.local`.
- La extensión no realiza follows, unfollows, mensajes ni acciones masivas.
- La extensión no solicita contraseñas.
- Borrar el historial de un perfil elimina sus reportes locales.
- Borrar la extensión elimina su almacenamiento local salvo que antes se haya exportado un backup.
- Los archivos exportados quedan bajo control del usuario y deben eliminarse manualmente cuando ya no se necesiten.

## Modelo de datos

```text
ft_history_<perfil>   → última captura completa
ft_timeline_<perfil>  → línea base, reportes y eventos
```

Cada reporte conserva:

```text
id / runId
capturedAt
followersCount
followingCount
mutualCount
newFollowers
lostFollowers
newFollowing
lostFollowing
```

Cada evento conserva:

```text
username
type
occurredAt
reportId
runId
```

La línea temporal guarda una captura base y los cambios posteriores. De esa forma puede reconstruir reportes históricos sin duplicar miles de nombres en cada ejecución.

## Instalación

### 1. Descargar el proyecto

Desde GitHub:

1. Abrí **Code**.
2. Seleccioná **Download ZIP**.
3. Descomprimí el repositorio.

También podés clonarlo:

```bash
git clone https://github.com/viceKDK/Follow-Tracker.git
cd Follow-Tracker
```

### 2. Cargar la extensión

1. Abrí `chrome://extensions` o `edge://extensions`.
2. Activá **Modo desarrollador**.
3. Pulsá **Cargar descomprimida**.
4. Seleccioná la carpeta `extension/`.
5. Fijá Follow Tracker en la barra del navegador.

<table>
  <tr>
    <td width="50%"><img src="docs/01-extensions.png" alt="Página de extensiones"></td>
    <td width="50%"><img src="docs/02-dev-mode.png" alt="Modo desarrollador"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/03-load-unpacked.png" alt="Cargar extensión descomprimida"></td>
    <td width="50%"><img src="docs/04-pin-icon.png" alt="Fijar icono de Follow Tracker"></td>
  </tr>
</table>

## Uso

1. Iniciá sesión en Instagram en el mismo navegador.
2. Abrí un perfil con formato `instagram.com/usuario/`.
3. Pulsá el icono de Follow Tracker.
4. Seleccioná **Analizar perfil actual**.
5. Mantené la pestaña abierta durante el recorrido.
6. Al finalizar se guarda la captura localmente y se abre el dashboard.
7. Desde **Antes y ahora**, elegí dos reportes para comparar las relaciones.
8. Exportá un backup JSON cuando quieras conservar o trasladar el historial.

<table>
  <tr>
    <td width="33%"><img src="docs/07-profile-open.png" alt="Perfil de Instagram abierto"></td>
    <td width="33%"><img src="docs/08-analysis-running.png" alt="Análisis en curso"></td>
    <td width="33%"><img src="docs/09-analysis-finished.png" alt="Análisis finalizado"></td>
  </tr>
</table>

Atajo del dashboard: pulsá `/` fuera de un campo para enfocar la búsqueda de la sección activa.

## Limitaciones

Instagram puede:

- imponer pausas;
- responder con errores `429` o `503`;
- ocultar cuentas suspendidas;
- mostrar contadores distintos a las filas que entrega;
- modificar su interfaz o endpoints internos.

Por eso:

- no se promete una duración fija;
- no se debe cerrar la pestaña durante el análisis;
- solamente una captura suficientemente completa actualiza el historial;
- una cuenta privada requiere que la sesión activa tenga acceso a sus listas;
- el recorrido visual es más lento que el modo API;
- la fecha de un evento es la fecha del reporte que lo detectó, no necesariamente la fecha exacta del follow o unfollow.

## Desarrollo

Requisitos:

- Node.js 20 o superior;
- Chromium para las pruebas E2E.

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run e2e:fixture
npm run e2e
```

La CI ejecuta pruebas unitarias, validación sintáctica, fixture smoke y Playwright.

### Estructura

```text
extension/
  manifest.json
  background.js
  content.js
  core.js
  history.js
  product-core.js
  export-policy.js
  popup.html
  popup.css
  popup.js
  dashboard.html
  dashboard.css
  dashboard-table.css
  dashboard-ux.css
  dashboard-product.css
  dashboard.js
  dashboard-table.js
  dashboard-ux.js
  dashboard-product.js

docs/
  capturas, documentación y checklist final de QA

tests/
  pruebas unitarias y E2E
```

## Estado del producto

La versión 2.1 cierra el flujo principal:

```text
analizar → guardar → comparar → investigar una persona → filtrar actividad → exportar → restaurar backup
```

El trabajo futuro debe priorizar compatibilidad cuando Instagram cambie, correcciones y validación real; no agregar complejidad que desvíe el producto de la comparación privada de seguidores.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
