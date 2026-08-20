# Follow-Tracker

![Python Version](https://img.shields.io/badge/python-3.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Herramienta para comparar seguidores y seguidos de Instagram.

## Novedades

- Flujo `1 solo EXE` con modo `AUTO 1-click (esperar)`.
- Extensión de navegador `1 clic` sin consola (`extension/`).
- Historial por perfil con altas y bajas: nuevos seguidores, nuevos seguidos, dejaron de seguirte y dejaste de seguir.
- Capturas identificadas por `run_id`, sin mezclar archivos de ejecuciones diferentes.
- Las capturas parciales no reemplazan una línea base completa.
- Carpeta fija `yo/` para tus JSON descargados de Instagram.
- Scraper automático por perfil externo: primero `followers`, luego `following`.
- En extensión: panel flotante fijo durante ejecución, con botón `X` para cerrarlo manualmente.
- Detección del total esperado del perfil (`esperado=<n>`) y recuperación automática si hay estancamiento.
- Reporte final con `Ultimo Scrapeo`.

## Instalación guiada de la extensión

Recomendado para usuario final.

### Pasos con capturas

| # | Acción | Captura |
|---|--------|---------|
| 1 | Abre `chrome://extensions` (o `edge://extensions`) | ![Paso 1](docs/01-extensions.png) |
| 2 | Activa **Modo desarrollador** (esquina superior derecha) | ![Paso 2](docs/02-dev-mode.png) |
| 3 | Pulsa **Cargar descomprimida** y selecciona la carpeta `extension/` | ![Paso 3](docs/03-load-unpacked.png) |
| 4 | Fija el icono de la extensión en la barra | ![Paso 4](docs/04-pin-icon.png) |
| 5 | Abre Instagram en el perfil objetivo y pulsa el icono de la extensión. El panel flotante aparece arriba a la derecha. Click en **Iniciar análisis** | ![Paso 5](docs/05-overlay.png) |
| 6 | Espera a que termine. Los archivos se descargan automáticamente | ![Paso 6](docs/09-analysis-finished.png) |

> Las imágenes están en `docs/`. Las capturas de instalación que todavía no se hayan agregado aparecerán como un cuadro vacío en GitHub.

### Así se ve la extensión

**1. Abre el perfil que quieres analizar**

<img src="docs/07-profile-open.png" alt="Perfil de Instagram abierto antes del análisis" width="900">

**2. Pulsa el icono de la extensión para abrir el panel**

<img src="docs/05-overlay.png" alt="Panel Follow Tracker Auto listo para iniciar" width="900">

**3. Durante el análisis puedes ver el progreso de seguidores y seguidos**

<img src="docs/08-analysis-running.png" alt="Follow Tracker Auto mostrando el análisis en progreso" width="900">

**4. Al finalizar muestra el método utilizado, el 100% recolectado y el historial guardado**

<img src="docs/09-analysis-finished.png" alt="Follow Tracker Auto con el análisis finalizado mediante API" width="900">

Qué hace automáticamente:

1. Abre `followers`.
2. Extrae usuarios con scroll progresivo y pausas aleatorias.
3. Cierra ese modal.
4. Abre `following`.
5. Repite extracción.
6. Descarga resultados.
7. Guarda una línea base local solo si ambas listas tienen cobertura suficiente.

Archivos descargados:

- `ig_auto_<perfil>_followers_<run_id>_<ts>.csv`
- `ig_auto_<perfil>_following_<run_id>_<ts>.csv`
- `ig_auto_<perfil>_seguidores_vs_seguidos_<fecha>.xls` (compatible con Excel)

Notas:

- Requiere **sesión activa de Instagram** en el mismo perfil de navegador (cookies `csrftoken`, `sessionid`, `ds_user_id`). Si no estás logueado, el modo API se salta y solo opera el UI fallback.
- Mantén activa la pestaña de Instagram para máxima estabilidad.
- Si cambias de pestaña puede ralentizarse la carga del modal.
- La extensión intenta primero el modo **API** (`/api/v1/friendships/...`). Si Instagram responde con errores `429`/`503`, espera y reintenta automáticamente. Si la API falla o devuelve demasiado poco, cambia al modo **UI** (modal o ruta `/usuario/followers/`) y comienza un nuevo recorrido de las listas.
- Cuando se ejecutan primero los reintentos de API y después el recorrido por UI, el análisis puede demorar considerablemente más porque se utilizaron ambos métodos.
- El objetivo es obtener la mayor cobertura posible, pero no se garantiza siempre el 100%: Instagram puede mostrar un contador diferente de la cantidad de usuarios que realmente entrega. La extensión informa esa diferencia y conserva los usuarios obtenidos.
- Si una captura no llega al umbral de cobertura, el reporte se genera pero el historial anterior no se reemplaza. Así se evitan falsos “nuevos seguidores” en la próxima ejecución.
- Los botones **Exportar historial** y **Borrar historial** administran los datos locales del perfil abierto.

### Privacidad de los datos

- Las listas y el historial se procesan en tu equipo y se guardan en el almacenamiento local de la extensión.
- La extensión no envía el historial a servidores propios.
- Al desinstalar la extensión o usar **Borrar historial**, se elimina la línea base local correspondiente.
- Los CSV y reportes descargados quedan en tu carpeta de descargas y debes borrarlos manualmente si ya no los necesitas.

### Rendimiento y tiempo de espera

Cuantos más seguidores y seguidos tenga el perfil, más tiempo demorará el análisis. La extensión debe recorrer las dos listas completas, por lo que el tiempo depende de la suma de ambas.

- El modo **API** normalmente es el más rápido y procesa los usuarios por páginas.
- El modo **UI** necesita abrir las listas y desplazarse progresivamente, por lo que puede demorar bastante más.
- Una conexión lenta, los límites temporales de Instagram (`429`/`503`), los reintentos y una pestaña en segundo plano también aumentan el tiempo.
- No cierres la pestaña ni cambies de perfil mientras el análisis esté en curso.
- No existe un tiempo fijo garantizado: dos cuentas con cantidades similares pueden demorar diferente.

Para obtener tiempos reales conviene probar perfiles de distintos tamaños. Una matriz inicial recomendada es:

| Caso | Seguidores aproximados | Seguidos aproximados | Objetivo |
|------|-------------------------|----------------------|----------|
| Pequeño | 1.000 (1K) | 500 | Medir el funcionamiento normal con API y UI |
| Mediano | 10.000 (10K) | 1.000 | Medir una extracción larga y el límite actual del modo UI |
| Muchos seguidos | 10.000 (10K) | 7.500 | Comprobar el efecto de recorrer una segunda lista grande |
| Estrés | 100.000 (100K) | 1.000 | Evaluar límites, memoria, bloqueos y respuestas de Instagram |

Estimaciones iniciales de duración (todavía no verificadas mediante pruebas controladas):

| Tamaño aproximado | Tiempo estimado por API | Tiempo estimado por UI |
|-------------------|-------------------------|------------------------|
| 1K seguidores | 20–60 segundos | 5–15 minutos |
| 10K seguidores | 2–5 minutos | 20–60 minutos |
| 100K seguidores | 45–90 minutos o más | No recomendable |

> Estos tiempos son orientativos, no resultados medidos. Pueden cambiar considerablemente según la cantidad de seguidos, la conexión, la velocidad de respuesta de Instagram, los reintentos y los bloqueos temporales. Para publicar tiempos confiables se debe ejecutar cada caso varias veces y calcular un promedio.

Registrar el resultado de cada ejecución:

| Perfil probado | Seguidores | Seguidos | Método usado | Duración | Reintentos | Usuarios obtenidos | Resultado |
|-----------------|------------|----------|--------------|----------|------------|--------------------|-----------|
|                 |            |          | API / UI     |          |            |                    |           |

Las pruebas deberían incluir, como mínimo, una cuenta pequeña, una mediana y una grande, usando el mismo equipo y conexión. El tiempo debe medirse desde **Iniciar análisis** hasta que aparezca **Finalizado** y se descargue el Excel.

> **Límite actual:** el modo UI recolecta hasta 10.000 usuarios por lista. El modo API permite hasta 600 páginas de 100 usuarios (aproximadamente 60.000 por lista). Por eso una cuenta de 100K sirve actualmente como prueba de estrés, pero no se debe considerar una extracción completa. Además, puede generar muchos reintentos y bloqueos temporales de Instagram.

## Uso rápido (Windows EXE)

1. Descarga `comparar_ig.exe` desde Releases.
2. Ejecuta el EXE.
3. Elige modo:

### Modo 1: Mi cuenta (JSON)

1. Crea carpeta `yo` junto al EXE.
2. Copia:
- uno o varios `yo/followers*.json`
- uno o varios `yo/following*.json`
3. Pulsa `Usar mi cuenta (JSON)` e indica el perfil al que pertenece la descarga.

Salida:

- `yo/seguidores_vs_seguidos.xlsx`

### Modo 2: Otra cuenta (AUTO 1-click)

1. Pulsa `AUTO 1-click (esperar)` en el EXE.
2. Deja el EXE abierto.
3. En Instagram perfil objetivo, ejecuta `smart_scraper.js`.
4. El EXE detecta los CSV nuevos y genera salida automática.

> Este modo se mantiene por compatibilidad. Para instalaciones nuevas se recomienda usar directamente la extensión, que genera los dos CSV y el reporte sin ejecutar código manualmente.

Salida en carpeta por usuario:

- `<usuario>/followers.csv`
- `<usuario>/following.csv`
- `<usuario>/seguidores_vs_seguidos.xlsx`

## Uso para desarrolladores (Python)

```bash
pip install -r requirements.txt
python comparar_ig.py
```

Verificaciones locales:

```bash
python -m unittest discover -s tests -v
npm test
npm run check
npm run e2e:fixture
npm run e2e
```

`npm run e2e:fixture` valida sin navegador el fixture determinista. `npm run e2e` ejecuta la extensión real en Chrome sobre rutas de Instagram interceptadas, sin iniciar sesión ni acceder a la red. Incluye perfiles normales, cuentas vacías y cancelación durante una petición lenta. Ver [`tests/e2e/README.md`](tests/e2e/README.md).

## Cómo obtener JSON oficiales de tu cuenta

En Instagram:

1. Perfil -> Configuración -> Tu información y permisos -> Descargar tu información.
2. Selecciona `Seguidores y seguidos`.
3. Formato `JSON`.
4. Copia esos archivos a `yo/`.

## Generar EXE

```bash
pip install -r requirements-dev.txt
./build.ps1
```

Salidas:

- `dist/comparar_ig.exe`
- `dist/follow-tracker-extension.zip`

Cada push y pull request ejecuta las pruebas en GitHub Actions. Al publicar un tag `v*`, el workflow de release crea el EXE, empaqueta la extensión y adjunta ambos artefactos a un GitHub Release.

## Estructura técnica

- `extension/core.js`: comparación, cobertura, nombres de archivos y CSV; es independiente del navegador y tiene pruebas unitarias.
- `extension/content.js`: integración con Instagram, API, fallback UI y panel flotante.
- `comparar_ig.py`: lectura JSON/CSV, historial y generación del XLSX.
- `auto_watcher.py`: compatibilidad con el flujo legacy; reutiliza la lógica de `comparar_ig.py`.
- `smart_scraper.js` y `analizar_csv.py`: entradas de compatibilidad para instalaciones anteriores.

## Licencia

MIT. Ver `LICENSE`.
