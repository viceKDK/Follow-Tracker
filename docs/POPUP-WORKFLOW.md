# Popup y flujo diario de Follow Tracker

## Qué ve una persona al abrir la extensión

El popup tiene una única acción principal, determinada por la pestaña activa y el estado local del perfil:

| Situación | Acción principal | Qué ocurre |
| --- | --- | --- |
| Nunca usó la extensión | Abrir Instagram para empezar | Abre instagram.com. No intenta capturar desde otra web. |
| Está en un perfil válido de Instagram, sin reportes | Hacer primera captura | Comprueba que el content script esté activo y abre la interfaz de captura y revisión. |
| Está en un perfil válido con reportes | Actualizar captura | Captura de nuevo y solicita revisar el resultado antes de guardarlo (salvo la política existente de autoaceptación de capturas confiables). |
| Hay una captura pendiente para ese perfil | Continuar revisión | Reabre la interfaz existente y recupera la captura pendiente, sin iniciar otra captura. |
| Está en otra web y selecciona un perfil guardado | Abrir @perfil para analizar | Abre el perfil correcto en Instagram. El usuario podrá iniciar la captura desde allí. |

Se muestran tres etapas de progreso: primera captura, segunda captura/revisión y exploración. **Las etapas son orientativas**: el popup no reemplaza los controles de calidad del almacenamiento y no promete la fecha exacta del cambio en Instagram.

## Accesos directos

- **Abrir mi resumen:** `dashboard.html?profile=...#overview`.
- **Recientes:** `#recent`, seguidores/seguidos conocidos ordenados por detección; los anteriores a la primera captura carecen de fecha real.
- **Cambios:** `#relationships`, comparación de reportes.
- **Actividad:** `#activity`, historial de cambios detectados.
- **Opciones y administración:** incluye importación oficial, backups y controles del historial.

El perfil seleccionado se conserva en el parámetro `profile` al navegar. El dashboard valida ese parámetro frente a los perfiles realmente guardados. Los nombres de usuario se restringen a caracteres válidos antes de construir enlaces.

## Después de guardar una captura

`background.js` sigue abriendo el dashboard después de un guardado explícitamente confirmado o aceptado conforme a la política existente. En la versión actual intenta seleccionar la pantalla más relevante a partir del **reporte actual efectivamente almacenado**, sin inferir cambios:

1. Si es una captura confiable con al menos dos reportes y nuevas relaciones detectadas: **Recientes**.
2. Si es una captura confiable con bajas detectadas, pero sin altas: **Antes y ahora**.
3. Si es la primera captura, no hay cambios, el reporte todavía no llegó al historial o la calidad exige atención: **Resumen**.

Si la escritura asíncrona del historial todavía no terminó, la navegación vuelve a Resumen; no inventa comparaciones ni fuerza recargas. La clasificación y confirmación de bajas siguen en el motor canónico.

## Rendimiento y privacidad

La selección de perfiles intenta `chrome.storage.local.getKeys()` en navegadores Chromium compatibles, y luego solicita solo la metadata pequeña `ft_profile_meta_*` para ordenarlos. **No carga todos los seguidores y todos los eventos de todos los perfiles simplemente para abrir el popup.** La captura e historial completos se consultan solamente para el perfil seleccionado. En navegadores antiguos se conserva la alternativa `get(null)`.

No se agregan permisos ni servidores, no se modifica el seguimiento de cuentas en Instagram y no se automatiza la aprobación de reportes.

## Verificación

- `node --test extension/popup-core.test.js extension/background.test.js`
- `npm run e2e:popup`
- `npm run check`
- `npm run e2e`

Las pruebas de popup cubren selección desde otras webs, acceso a resultados, primera captura, continuación de captura pendiente y ruta de lectura rápida de metadatos. Las pruebas del background cubren los destinos contextuales, incluidos reportes sospechosos.
