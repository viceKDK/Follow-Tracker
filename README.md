# Follow-Tracker 🕵️‍♂️

![Python Version](https://img.shields.io/badge/python-3.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Una herramienta simple para rastrear quién te sigue y a quién sigues en Instagram, y detectar quién no te devuelve el follow.

## 🚀 Cómo usar (Sin instalar nada)

Si no tienes Python, puedes usar la versión lista para Windows:

1. Ve a la sección de [Releases](https://github.com/viceKDK/Follow-Tracker/releases) y descarga el archivo `comparar_ig.exe`.
2. Pon el archivo `.exe` en una carpeta nueva.
3. Coloca tus archivos `followers_1.json` y `following.json` (obtenidos de Instagram) **en esa misma carpeta**.
4. Haz doble clic en `comparar_ig.exe`.
5. ¡Listo! Se abrirá una ventana confirmando que se generó el Excel en esa misma carpeta.

> [!IMPORTANT]
> **Aviso sobre Antivirus:** Al ser un archivo ejecutable no firmado creado con Python, es posible que Windows Defender o tu antivirus lo detecten como una amenaza (falso positivo). Esto es normal en herramientas de código abierto. Puedes ejecutarlo con confianza o revisar el código fuente en este repositorio.

## 🐍 Uso para Desarrolladores (Python)

Si prefieres ejecutar el código fuente:

1. Clona el repositorio.
2. Instala las dependencias: `pip install -r requirements.txt`.
3. Asegúrate de tener los archivos `.json` en la raíz del proyecto.
4. Ejecuta: `python comparar_ig.py`.

## 📂 Cómo obtener tus datos de Instagram (Paso a Paso)

Para que el script funcione, necesitas descargar tu información de Instagram en formato **JSON**:

1. Ve a tu perfil > **Configuración** > **Tu información y permisos** > **Descargar tu información**.
2. Selecciona **"Descargar o transferir información"**.
3. Elige **"Parte de la información"**.
4. Selecciona únicamente **"Seguidores y seguidos"**.
5. **Muy importante**: En la pantalla de selección de formato, cambia de HTML a **JSON**.
6. Una vez que Instagram te envíe el archivo (puede tardar desde unos minutos hasta unas horas), busca dentro del ZIP estos archivos y colócalos en la misma carpeta que el programa:
   - `followers_1.json`
   - `following.json`

## 🛠️ Uso

Ejecuta el script principal:
```bash
python comparar_ig.py
```

El script generará un archivo **Excel (.xlsx)** llamado `seguidores_vs_seguidos.xlsx` con las siguientes columnas:

### Columnas principales:
- **Nos seguimos**: Personas con follow mutuo.
- **No lo sigo**: Personas que te siguen pero a las que tú no sigues.
- **No me sigue**: Personas a las que sigues pero que no te siguen de vuelta.

### Columnas de comparación:
- **Nuevos Seguidores**: Personas que te empezaron a seguir desde la última vez que ejecutaste el análisis.
- **Nuevos Siguiendo**: Personas que empezaste a seguir desde la última vez que ejecutaste el análisis.

> [!NOTE]
> Las columnas de comparación estarán vacías en la primera ejecución. A partir de la segunda ejecución, el script comparará automáticamente con los datos anteriores y mostrará los nuevos seguidores y seguidos.

## ⚖️ Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.