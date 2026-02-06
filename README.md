# Follow-Tracker

![Python Version](https://img.shields.io/badge/python-3.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Herramienta para comparar seguidores y seguidos de Instagram, tanto de tu cuenta (JSON oficial) como de cuentas externas (CSV del scraper).

## Novedades

- Flujo de `1 solo EXE` con modo `AUTO 1-click (esperar)`.
- Extension de navegador `1 clic` sin consola (`extension/`).
- Carpeta fija `yo/` para tus JSON descargados de Instagram.
- Scraper automático por perfil externo: primero followers, luego following.
- Generación automática de carpeta por usuario externo con:
  - `followers.csv`
  - `following.csv`
  - `seguidores_vs_seguidos.xlsx`
- Nueva columna en Excel: `Ultimo Scrapeo`.

## Uso rápido (Windows EXE)

1. Descarga `comparar_ig.exe` desde Releases.
2. Ejecuta el EXE.
3. Elige uno de estos modos:

### Modo 1: Mi cuenta (JSON)

1. Crea la carpeta `yo` dentro de la carpeta del EXE.
2. Pon ahí:
   - `yo/followers_1.json`
   - `yo/following.json`
3. En el EXE, pulsa `Usar mi cuenta (JSON)`.
4. Resultado:
   - `yo/seguidores_vs_seguidos.xlsx`

### Modo 2: Otra cuenta (AUTO 1-click)

1. Abre el EXE y pulsa `AUTO 1-click (esperar)`.
2. Deja el EXE abierto.
3. En el navegador, abre Instagram en el perfil objetivo (ejemplo: `instagram.com/usuario/`).
4. Ejecuta `smart_scraper.js` en la consola del navegador.
5. El scraper hace automáticamente:
   - scrape de followers
   - scrape de following
   - descarga ambos CSV
6. El EXE detecta los CSV nuevos y genera todo solo.

Salida final en carpeta por usuario (dentro del proyecto):

- `<usuario>/followers.csv`
- `<usuario>/following.csv`
- `<usuario>/seguidores_vs_seguidos.xlsx`

## Uso 0 pasos tecnicos (Extension)

Si quieres evitar consola y pasos tecnicos, usa la extension incluida en `extension/`.

1. Abre `chrome://extensions` o `edge://extensions`.
2. Activa `Modo desarrollador`.
3. Pulsa `Cargar descomprimida`.
4. Selecciona la carpeta `extension` de este proyecto.
5. Abre Instagram en el perfil objetivo.
6. Abre el popup de la extension y pulsa `Iniciar analisis`.

Resultado automatico por descarga:

- `ig_auto_<perfil>_followers_<ts>.csv`
- `ig_auto_<perfil>_following_<ts>.csv`
- `ig_auto_<perfil>_seguidores_vs_seguidos_<fecha>.xls` (compatible con Excel, incluye `Ultimo Scrapeo`)

## Uso para desarrolladores (Python)

1. Clona el repo.
2. Instala dependencias:

```bash
pip install -r requirements.txt
```

3. Ejecuta:

```bash
python comparar_ig.py
```

## Cómo obtener JSON oficiales de tu cuenta

En Instagram:

1. Perfil -> Configuración -> Tu información y permisos -> Descargar tu información.
2. Selecciona solo `Seguidores y seguidos`.
3. Formato: `JSON`.
4. Copia los archivos a `yo/`.

## Generar el EXE

```bash
pyinstaller --noconfirm comparar_ig.spec
```

Salida:

- `dist/comparar_ig.exe`

## Nota de seguridad

Windows Defender puede marcar ejecutables de Python no firmados como falso positivo.

## Licencia

MIT. Ver `LICENSE`.
