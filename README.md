<div align="center">

# Follow Tracker

### Compará seguidores y seguidos entre dos fechas

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-2f6df6?style=for-the-badge&logo=googlechrome&logoColor=white)](#instalación)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-15966d?style=for-the-badge&logo=nodedotjs&logoColor=white)](#desarrollo)
[![License](https://img.shields.io/badge/License-MIT-17213b?style=for-the-badge)](LICENSE)

Extensión de navegador para guardar reportes de Instagram y ver cómo estaba cada relación antes y cómo está ahora.

</div>

> [!IMPORTANT]
> El valor principal de Follow Tracker no es solamente contar seguidores. Es comparar dos reportes y mostrar, persona por persona, si te sigue, si la seguís, si se siguen o si alguno dejó de seguir al otro.

> [!NOTE]
> Follow Tracker no está afiliado con Instagram ni Meta. Funciona sobre la sesión abierta en el navegador y puede necesitar mantenimiento cuando Instagram modifica su interfaz o sus endpoints internos.

## Frontend

<p align="center">
  <img src="docs/dashboard-showcase.webp" alt="Pestaña Antes y ahora de Follow Tracker, con la relación anterior y actual de cada persona" width="600">
</p>

> Todas las cuentas, fechas y cifras de la captura son ficticias.

El dashboard se divide en cuatro pestañas claras:

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | Cantidad actual de seguidores, seguidos, personas que se siguen, relaciones no correspondidas, bajas recientes y evolución |
| **Antes y ahora** | Comparación detallada entre un reporte anterior y uno actual |
| **Personas** | Estado actual e historial individual de cada usuario |
| **Actividad** | Todos los cambios detectados, ordenados por fecha y reporte |

## Antes y ahora

Esta es la pantalla principal del producto.

Seleccionás:

1. un **reporte anterior**;
2. un **reporte actual**.

La aplicación reconstruye ambas capturas y compara las dos listas completas.

Para cada persona muestra:

- su relación en el reporte anterior;
- su relación en el reporte actual;
- una frase que explica exactamente qué pasó.

### Estados actuales

| Estado | Significado |
|---|---|
| **Se siguen** | Vos lo seguís y esa persona también te sigue |
| **Te sigue; no lo seguís** | Esa persona te sigue, pero vos no la seguís |
| **Lo seguís; no te sigue** | Vos seguís a esa persona, pero ella no te sigue |
| **No se siguen** | Ninguno sigue al otro |

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

La pestaña permite filtrar por:

- relaciones que cambiaron;
- personas que te siguen ahora;
- personas que te dejaron de seguir;
- personas que seguís y no te siguen;
- personas que te siguen y no seguís;
- personas que se siguen;
- todas las personas presentes en cualquiera de los dos reportes.

## Resumen actual

El resumen muestra el último reporte guardado:

- **Te siguen:** total de seguidores actuales.
- **Seguís:** total de cuentas seguidas actualmente.
- **Se siguen:** relaciones mutuas.
- **Te siguen; no los seguís:** seguidores que no seguís.
- **Los seguís; no te siguen:** cuentas que seguís y no te siguen.
- **Te dejaron de seguir:** bajas detectadas desde el reporte anterior.

También incluye una gráfica con la evolución de seguidores y seguidos a través de todos los reportes.

## Personas

La pestaña **Personas** permite buscar una cuenta y ver:

- estado actual;
- cantidad de cambios guardados;
- último cambio detectado;
- fecha;
- reporte que detectó el cambio;
- historial individual completo.

Filtros disponibles:

- Todos.
- Te dejó de seguir.
- Te sigue; no lo seguís.
- Lo seguís; no te sigue.
- Se siguen.
- Ya no se siguen.

## Actividad

La pestaña **Actividad** ordena todos los eventos desde el más reciente:

```text
@beto te dejó de seguir
22 ago. 2026, 15:30
Reporte r4
```

La fecha indica cuándo el reporte detectó el cambio. La extensión no puede saber el segundo exacto en el que una persona siguió o dejó de seguir la cuenta entre dos análisis.

## Cómo funciona

```text
Primer análisis  → crea la línea base
Segundo análisis → compara contra la línea base
Nuevos análisis  → amplían el historial
Dos reportes      → permiten reconstruir el antes y el ahora
```

Una captura incompleta no reemplaza el historial válido ni genera falsos unfollows.

## Funciones

- seguimiento separado para varios perfiles;
- comparación entre reportes consecutivos o no consecutivos;
- reconstrucción de capturas históricas;
- comparación de seguidores y seguidos;
- estado anterior y actual por persona;
- búsqueda y filtros;
- historial individual;
- actividad cronológica;
- evolución mediante gráfica;
- exportación JSON y CSV;
- descarga automática de los CSV crudos de cada análisis.

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
6. Al finalizar se guardará el reporte y se abrirá el dashboard.
7. Desde **Antes y ahora**, elegí dos reportes para comparar las relaciones.

<table>
  <tr>
    <td width="33%"><img src="docs/07-profile-open.png" alt="Perfil de Instagram abierto"></td>
    <td width="33%"><img src="docs/08-analysis-running.png" alt="Análisis en curso"></td>
    <td width="33%"><img src="docs/09-analysis-finished.png" alt="Análisis finalizado"></td>
  </tr>
</table>

El análisis intenta primero el modo API. Cuando no obtiene cobertura suficiente, utiliza el recorrido visual de las listas como alternativa.

## Exportaciones

Cada análisis completo descarga dos CSV crudos con el mismo identificador:

```text
ig_auto_<perfil>_followers_<run_id>_<timestamp>.csv
ig_auto_<perfil>_following_<run_id>_<timestamp>.csv
```

Desde el dashboard también se puede exportar:

- **Backup JSON:** captura actual, reportes y eventos.
- **Actividad CSV:** usuario, evento, fecha, reporte y `run_id`.
- **Relaciones CSV:** estado actual de cada persona.

## Privacidad

Los reportes se almacenan mediante `chrome.storage.local`.

- No existe un backend propio.
- No se crea una cuenta de Follow Tracker.
- La extensión no realiza follows, unfollows, mensajes ni acciones masivas.
- Borrar la extensión o el historial de un perfil elimina sus datos locales.
- Los archivos exportados deben borrarse manualmente cuando ya no se necesiten.

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

La línea temporal guarda una captura base y los cambios posteriores. Con esa información puede reconstruir reportes anteriores sin duplicar miles de nombres en cada ejecución.

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
- el recorrido visual es más lento que el modo API.

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

### Estructura

```text
extension/
  manifest.json
  background.js
  content.js
  core.js
  history.js
  export-policy.js
  popup.html
  popup.css
  popup.js
  dashboard.html
  dashboard.css
  dashboard.js

docs/
  capturas de instalación, análisis y frontend

tests/
  pruebas unitarias y E2E
```

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
