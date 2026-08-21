# Follow Tracker

![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-7557ff)
![Node](https://img.shields.io/badge/Node-%3E%3D20-43853d)
![License](https://img.shields.io/badge/license-MIT-169c72)

Extensión de navegador para comparar seguidores y seguidos de Instagram, detectar cambios entre capturas y conservar un historial local por persona, fecha y reporte.

> Follow Tracker no está afiliado con Instagram ni Meta. Funciona sobre la sesión que ya está abierta en tu navegador y puede requerir mantenimiento cuando Instagram modifica su interfaz o sus endpoints internos.

## Vista del dashboard

![Dashboard de Follow Tracker con datos ficticios](docs/dashboard-demo.png)

> La captura utiliza datos completamente ficticios y sirve únicamente para mostrar la interfaz.

## Funciones principales

La fuente de verdad del proyecto es exclusivamente `extension/`. No existe aplicación de escritorio, instalador, EXE ni backend.

- total actual de seguidores, seguidos y relaciones mutuas;
- personas que sigues y no te siguen;
- personas que te siguen y no sigues;
- evolución de seguidores y seguidos por reporte;
- última comparación entre capturas;
- comparación manual entre cualquier par de reportes guardados;
- actividad cronológica por usuario;
- búsqueda, filtros e historial individual;
- fecha y `run_id` de cada cambio detectado;
- exportación de backup JSON, actividad CSV y relaciones CSV;
- soporte para varios perfiles con historiales separados;
- descarga automática de los dos CSV crudos de cada captura.

Ejemplo de evento conservado:

```text
@beto — Te dejó de seguir
21/08/2026 15:30
Reporte: 20260821t153000-ab123
```

La primera captura completa crea una línea base. Desde la segunda captura completa se registran altas y bajas. Una captura parcial no reemplaza la línea base ni genera falsos unfollows.

La fecha de cada evento es la fecha en que **el reporte detectó el cambio**. La extensión no puede saber el instante exacto en que otra persona pulsó seguir o dejar de seguir entre dos capturas.

## Privacidad

Todo se procesa y almacena localmente mediante `chrome.storage.local`.

- No existe backend propio.
- No se crea una cuenta de Follow Tracker.
- No se envía el historial a servidores del proyecto.
- Los permisos se limitan a la pestaña activa, almacenamiento local, inyección del content script y acceso a `instagram.com`.
- `unlimitedStorage` evita perder historiales grandes por la cuota local predeterminada del navegador.

Borrar la extensión o usar **Borrar historial de este perfil** elimina los datos locales correspondientes. Las exportaciones descargadas deben borrarse manualmente cuando ya no se necesiten.

## Instalación desde `main`

`main` es la única fuente de distribución del proyecto. No se publican GitHub Releases ni ejecutables.

### Opción 1: descargar el código

1. En GitHub, abre **Code**.
2. Pulsa **Download ZIP**.
3. Descomprime el repositorio.
4. Abre `chrome://extensions` o `edge://extensions`.
5. Activa **Modo desarrollador**.
6. Pulsa **Cargar descomprimida**.
7. Selecciona la carpeta `extension/`.
8. Fija Follow Tracker en la barra del navegador.

### Opción 2: clonar el repositorio

```bash
git clone https://github.com/viceKDK/Follow-Tracker.git
cd Follow-Tracker
```

Luego carga la carpeta `extension/` como extensión descomprimida.

## Uso

1. Inicia sesión en Instagram en el mismo navegador.
2. Abre un perfil con formato `instagram.com/usuario/`.
3. Pulsa el icono de Follow Tracker.
4. Selecciona **Analizar perfil actual**.
5. Mantén la pestaña abierta mientras se recorren seguidores y seguidos.
6. Al finalizar se descargan los dos CSV de la captura y se abre automáticamente el dashboard.
7. Puedes volver al dashboard en cualquier momento desde el popup o el panel flotante.

El análisis intenta primero el modo API y, si no obtiene cobertura suficiente, usa el recorrido visual de las listas como fallback.

### Significado de las categorías

| Categoría | Significado |
|---|---|
| Mutuo | Ambos se siguen actualmente |
| Te sigue; no lo sigues | La persona te sigue, pero tú no |
| Lo sigues; no te sigue | Tú la sigues, pero ella no |
| Te siguió | Apareció en seguidores desde el reporte anterior |
| Te dejó de seguir | Desapareció de seguidores desde el reporte anterior |
| Empezaste a seguir | Apareció en seguidos desde el reporte anterior |
| Dejaste de seguir | Desapareció de seguidos desde el reporte anterior |
| Solo en historial | Ya no está en las listas actuales, pero conserva eventos previos |

## Dashboard

El dashboard se abre como una página interna de la extensión y funciona sin conexión adicional.

### Resumen

Muestra los indicadores principales y el cambio neto del último reporte.

### Evolución

Grafica los totales de seguidores y seguidos a lo largo de las capturas completas guardadas.

### Última comparación

Separa nuevos seguidores, bajas, nuevas cuentas seguidas y cuentas que dejaste de seguir.

### Comparar reportes

Permite elegir una captura inicial y otra final, aunque no sean consecutivas. El dashboard reconstruye ambas listas desde la línea base y los cambios guardados para mostrar altas, bajas y diferencias netas.

### Actividad

Ordena todos los eventos desde el más reciente. Cada fila incluye usuario, tipo de cambio, fecha y reporte.

### Personas

Permite buscar un usuario, filtrar relaciones y abrir su historial individual. Una persona que dejó de seguirte no desaparece del dashboard aunque ya no figure en la captura actual.

## Archivos y exportaciones

Cada análisis completo descarga automáticamente dos CSV crudos, identificados con el mismo `run_id`:

```text
ig_auto_<perfil>_followers_<run_id>_<timestamp>.csv
ig_auto_<perfil>_following_<run_id>_<timestamp>.csv
```

Sirven como respaldo portable, para comparar manualmente en Excel o Google Sheets y para procesarlos con otras herramientas. El reporte `.xls` heredado está desactivado porque el dashboard es la interfaz principal.

Desde el dashboard también se pueden descargar bajo demanda:

- **Backup JSON:** captura actual, línea base, reportes y eventos completos.
- **Actividad CSV:** usuario, evento, fecha, reporte y `run_id`.
- **Relaciones CSV:** estado actual de cada usuario.

## Modelo de datos

La extensión mantiene dos registros por perfil:

```text
ft_history_<perfil>   -> captura completa actual
ft_timeline_<perfil>  -> reportes y eventos históricos
```

La línea temporal conserva una única captura base y, después, solo los cambios por reporte. Así puede reconstruir y comparar capturas antiguas sin guardar una copia completa de miles de usuarios en cada ejecución.

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

Los datos anteriores de `ft_history_*` se migran automáticamente a una línea base la primera vez que se instala o actualiza la versión 2.

## Limitaciones conocidas

Instagram puede imponer pausas, devolver errores `429`/`503`, ocultar cuentas suspendidas o informar un contador distinto al número de filas que entrega. Por eso:

- no se promete una duración fija;
- no se deben cerrar la pestaña ni cambiar de perfil durante el análisis;
- solo una captura con cobertura suficiente actualiza el historial;
- una cuenta privada solo puede analizarse cuando la sesión activa tiene acceso a sus listas;
- el modo visual es más lento que el modo API;
- el funcionamiento puede cambiar cuando Instagram actualiza su web.

La extensión no realiza follows, unfollows, mensajes ni acciones masivas.

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
  manifest.json       Configuración Manifest V3
  icons/              Iconos de la extensión en 16/32/48/128 px
  background.js       Mensajería, badge y persistencia de la línea temporal
  content.js          Extracción API/UI y panel de progreso sobre Instagram
  core.js             Comparación y utilidades puras
  history.js          Reportes, eventos y migración del historial
  export-policy.js    Conserva los CSV, desactiva el Excel y enlaza el dashboard
  popup.*             Inicio rápido y acceso al dashboard
  dashboard.*         Interfaz de analítica e historial

docs/
  dashboard-demo.png  Captura de la interfaz con datos ficticios

tests/e2e/             Pruebas del flujo de extracción
.github/workflows/ci.yml  Integración continua
```

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
