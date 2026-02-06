# Follow-Tracker

![Python Version](https://img.shields.io/badge/python-3.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Herramienta para comparar seguidores y seguidos de Instagram.

## Novedades

- Flujo `1 solo EXE` con modo `AUTO 1-click (esperar)`.
- Extensión de navegador `1 clic` sin consola (`extension/`).
- Carpeta fija `yo/` para tus JSON descargados de Instagram.
- Scraper automático por perfil externo: primero `followers`, luego `following`.
- En extensión: panel flotante fijo durante ejecución, con botón `X` para cerrarlo manualmente.
- Detección del total esperado del perfil (`esperado=<n>`) y recuperación automática si hay estancamiento.
- Reporte final con `Ultimo Scrapeo`.

## Uso 0 pasos técnicos (Extensión)

Recomendado para usuario final.

1. Abre `chrome://extensions` o `edge://extensions`.
2. Activa `Modo desarrollador`.
3. Pulsa `Cargar descomprimida`.
4. Selecciona la carpeta `extension` del proyecto.
5. Abre Instagram en el perfil objetivo (ejemplo: `https://www.instagram.com/usuario/`).
6. Abre el popup y pulsa `Iniciar analisis`.

Qué hace automáticamente:

1. Abre `followers`.
2. Extrae usuarios con scroll progresivo y pausas aleatorias.
3. Cierra ese modal.
4. Abre `following`.
5. Repite extracción.
6. Descarga resultados.

Archivos descargados:

- `ig_auto_<perfil>_followers_<ts>.csv`
- `ig_auto_<perfil>_following_<ts>.csv`
- `ig_auto_<perfil>_seguidores_vs_seguidos_<fecha>.xls` (compatible con Excel)

Notas:

- Mantén activa la pestaña de Instagram para máxima estabilidad.
- Si cambias de pestaña puede ralentizarse la carga del modal.

## Uso rápido (Windows EXE)

1. Descarga `comparar_ig.exe` desde Releases.
2. Ejecuta el EXE.
3. Elige modo:

### Modo 1: Mi cuenta (JSON)

1. Crea carpeta `yo` junto al EXE.
2. Copia:
- `yo/followers_1.json`
- `yo/following.json`
3. Pulsa `Usar mi cuenta (JSON)`.

Salida:

- `yo/seguidores_vs_seguidos.xlsx`

### Modo 2: Otra cuenta (AUTO 1-click)

1. Pulsa `AUTO 1-click (esperar)` en el EXE.
2. Deja el EXE abierto.
3. En Instagram perfil objetivo, ejecuta `smart_scraper.js`.
4. El EXE detecta los CSV nuevos y genera salida automática.

Salida en carpeta por usuario:

- `<usuario>/followers.csv`
- `<usuario>/following.csv`
- `<usuario>/seguidores_vs_seguidos.xlsx`

## Uso para desarrolladores (Python)

```bash
pip install -r requirements.txt
python comparar_ig.py
```

## Cómo obtener JSON oficiales de tu cuenta

En Instagram:

1. Perfil -> Configuración -> Tu información y permisos -> Descargar tu información.
2. Selecciona `Seguidores y seguidos`.
3. Formato `JSON`.
4. Copia esos archivos a `yo/`.

## Generar EXE

```bash
pyinstaller --noconfirm comparar_ig.spec
```

Salida:

- `dist/comparar_ig.exe`

## Licencia

MIT. Ver `LICENSE`.
