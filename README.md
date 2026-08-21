# Follow Tracker

![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-7557ff)
![Node](https://img.shields.io/badge/Node-%3E%3D20-43853d)
![License](https://img.shields.io/badge/license-MIT-169c72)

Extension de navegador para comparar seguidores y seguidos de Instagram, detectar cambios entre capturas y conservar un historial local por persona, fecha y reporte.

> Follow Tracker no esta afiliado con Instagram ni Meta. Funciona sobre la sesion que ya esta abierta en tu navegador y puede requerir mantenimiento cuando Instagram modifica su interfaz o sus endpoints internos.

## Que cambia en la version 2

El proyecto deja de ser una mezcla entre una aplicacion de Windows y una extension. La fuente de verdad pasa a ser exclusivamente `extension/`.

La salida principal ya no es una planilla dificil de consultar, sino un dashboard dentro de la propia extension:

- total actual de seguidores, seguidos y relaciones mutuas;
- personas que sigues y no te siguen;
- personas que te siguen y no sigues;
- evolucion de seguidores y seguidos por reporte;
- ultima comparacion entre capturas;
- comparacion manual entre cualquier par de reportes guardados;
- actividad cronologica por usuario;
- busqueda y filtros;
- historial individual con fecha y `run_id` exactos;
- exportacion de backup JSON, actividad CSV y relaciones CSV;
- soporte para varios perfiles, cada uno con su propio historial.

Ejemplo de evento conservado:

```text
@beto — Te dejo de seguir
21/08/2026 15:30
Reporte: 20260821t153000-ab123
```

La primera captura completa crea una linea base. Desde la segunda captura completa se registran altas y bajas. Una captura parcial no reemplaza la linea base ni genera falsos unfollows.

La fecha de cada evento es la fecha en que **el reporte detecto el cambio**. La extension no puede saber el instante exacto en que otra persona pulso seguir o dejar de seguir entre dos capturas.

## Privacidad

Todo se procesa y almacena localmente mediante `chrome.storage.local`.

- No existe backend propio.
- No se crea una cuenta de Follow Tracker.
- No se envia el historial a servidores del proyecto.
- Los permisos se limitan a la pestaña activa, almacenamiento local, inyeccion del content script y acceso a `instagram.com`.
- `unlimitedStorage` evita perder historiales grandes por la cuota local predeterminada del navegador.

Borrar la extension o usar **Borrar historial de este perfil** elimina los datos locales correspondientes. Las exportaciones descargadas deben borrarse manualmente si ya no se necesitan.

## Instalacion manual

1. Descarga `follow-tracker-extension.zip` desde Releases.
2. Descomprime el archivo.
3. Abre `chrome://extensions` o `edge://extensions`.
4. Activa **Modo desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta que contiene `manifest.json`.
7. Fija Follow Tracker en la barra del navegador.

Tambien se puede clonar este repositorio y cargar directamente la carpeta `extension/`.

## Uso

1. Inicia sesion en Instagram en el mismo navegador.
2. Abre un perfil con formato `instagram.com/usuario/`.
3. Pulsa el icono de Follow Tracker.
4. Selecciona **Analizar perfil actual**.
5. Mantiene la pestaña abierta mientras se recorren seguidores y seguidos.
6. Al finalizar se descargan los dos CSV de la captura y se abre automaticamente el dashboard.
7. Tambien puedes volver al dashboard en cualquier momento desde el popup o el panel flotante.

El analisis intenta primero el modo API y, si no obtiene cobertura suficiente, usa el recorrido visual de las listas como fallback.

### Significado de las categorias

| Categoria | Significado |
|---|---|
| Mutuo | Ambos se siguen actualmente |
| Te sigue; no lo sigues | La persona te sigue, pero tu no |
| Lo sigues; no te sigue | Tu la sigues, pero ella no |
| Te siguio | Aparecio en seguidores desde el reporte anterior |
| Te dejo de seguir | Desaparecio de seguidores desde el reporte anterior |
| Empezaste a seguir | Aparecio en seguidos desde el reporte anterior |
| Dejaste de seguir | Desaparecio de seguidos desde el reporte anterior |
| Solo en historial | Ya no esta en las listas actuales, pero conserva eventos previos |

## Dashboard

El dashboard se abre como una pagina interna de la extension y funciona sin conexion adicional.

### Resumen

Muestra los indicadores principales y el cambio neto del ultimo reporte.

### Evolucion

Grafica los totales de seguidores y seguidos a lo largo de las capturas completas guardadas.

### Ultima comparacion

Separa nuevos seguidores, bajas, nuevas cuentas seguidas y cuentas que dejaste de seguir.

### Comparar reportes

Permite elegir una captura inicial y otra final, aunque no sean consecutivas. El dashboard reconstruye ambas listas desde la linea base y los cambios guardados para mostrar altas, bajas y diferencias netas.

### Actividad

Ordena todos los eventos desde el mas reciente. Cada fila incluye usuario, tipo de cambio, fecha y reporte.

### Personas

Permite buscar un usuario, filtrar relaciones y abrir su historial individual. Una persona que dejo de seguirte no desaparece del dashboard aunque ya no figure en la captura actual.

## Archivos y exportaciones

Cada analisis completo descarga automaticamente dos CSV crudos, identificados con el mismo `run_id`:

```text
ig_auto_<perfil>_followers_<run_id>_<timestamp>.csv
ig_auto_<perfil>_following_<run_id>_<timestamp>.csv
```

Sirven como respaldo portable, para comparar manualmente en Excel/Google Sheets o para procesarlos con otras herramientas. El reporte `.xls` heredado queda desactivado porque el dashboard pasa a ser la interfaz principal.

Desde el dashboard tambien se pueden descargar bajo demanda:

- **Backup JSON:** captura actual, linea base, reportes y eventos completos.
- **Actividad CSV:** usuario, evento, fecha, reporte y `run_id`.
- **Relaciones CSV:** estado actual de cada usuario.

## Modelo de datos

La extension mantiene dos registros por perfil:

```text
ft_history_<perfil>   -> captura completa actual
ft_timeline_<perfil>  -> reportes y eventos historicos
```

La linea temporal conserva una unica captura base y, despues, solo los cambios por reporte. Asi puede reconstruir y comparar capturas antiguas sin guardar una copia completa de miles de usuarios en cada ejecucion.

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

Los datos anteriores de `ft_history_*` se migran automaticamente a una linea base la primera vez que se instala o actualiza la version 2.

## Limitaciones conocidas

Instagram puede imponer pausas, devolver errores `429`/`503`, ocultar cuentas suspendidas o informar un contador distinto al numero de filas que entrega. Por eso:

- no se promete una duracion fija;
- no se deben cerrar la pestaña ni cambiar de perfil durante el analisis;
- solo una captura con cobertura suficiente actualiza el historial;
- una cuenta privada solo puede analizarse cuando la sesion activa tiene acceso a sus listas;
- el modo visual es mas lento que el modo API;
- el funcionamiento puede cambiar cuando Instagram actualiza su web.

La extension no realiza follows, unfollows, mensajes ni acciones masivas.

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
  manifest.json      Configuracion Manifest V3
  icons/              Iconos de la extension en 16/32/48/128 px
  background.js      Mensajeria, badge y persistencia de la linea temporal
  content.js         Extraccion API/UI y panel de progreso sobre Instagram
  core.js            Comparacion y utilidades puras
  history.js         Reportes, eventos y migracion del historial
  export-policy.js    Conserva los CSV, desactiva el Excel heredado y enlaza el dashboard
  popup.*             Inicio rapido y acceso al dashboard
  dashboard.*         Interfaz de analitica e historial

tests/e2e/            Pruebas del flujo de extraccion
.github/workflows/    CI y release de la extension
```

## Releases

Los tags `v*` ejecutan pruebas y publican un unico artefacto:

```text
follow-tracker-extension.zip
```

Ya no se compila ni publica un ejecutable de Windows.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
