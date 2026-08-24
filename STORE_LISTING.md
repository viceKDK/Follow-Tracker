# Ficha para Chrome Web Store / Microsoft Edge Add-ons

## Nombre

Follow Tracker — Antes y ahora

## Resumen corto

Compará seguidores y seguidos entre fechas con historial local, revisión de calidad y backups manuales.

## Descripción

Follow Tracker guarda capturas locales de seguidores y seguidos para mostrar qué cambió entre dos fechas.

La función central es **Antes y ahora**: elegís un reporte anterior y uno actual, y la extensión explica persona por persona si:

- te seguía antes;
- te sigue ahora;
- vos la seguías;
- todavía la seguís;
- empezó a seguirte;
- te dejó de seguir;
- dejó de ser una relación mutua;
- cambió su username y sigue siendo la misma cuenta.

### Capturas con revisión

Antes de modificar el historial, Follow Tracker muestra:

- cantidad recolectada;
- contador esperado;
- cobertura;
- fuente de los datos;
- advertencias;
- cambios detectados;
- bajas pendientes de confirmación.

Las bajas pueden requerir dos capturas consecutivas para reducir falsos unfollows provocados por respuestas incompletas de Instagram.

### Identidad estable

Cuando Instagram entrega un identificador estable, Follow Tracker conserva el historial aunque una persona cambie de username.

También incluye una herramienta manual para unir dos usernames cuando el cambio no pudo detectarse automáticamente.

### Importación oficial

Podés crear un reporte desde los archivos JSON de una descarga oficial de Instagram, sin depender de la API interna o del recorrido visual.

### Privacidad

- Sin cuenta de Follow Tracker.
- Sin backend propio.
- Sin analytics de seguidores.
- Datos guardados en el navegador.
- Exportaciones únicamente cuando las solicitás.
- No sigue, deja de seguir, publica ni envía mensajes.

### Administración

- múltiples perfiles;
- notas y etiquetas privadas;
- personas fijadas;
- eliminación segura de reportes intermedios;
- fusión de perfiles duplicados;
- fusión manual de identidades;
- backup y restauración completos;
- recordatorio de backup;
- rollback del último reporte.

## Categoría sugerida

Productividad / Herramientas sociales

## Idioma principal

Español

## Permisos explicados

- `activeTab`: detectar el perfil abierto cuando el usuario pulsa la extensión.
- `storage`: guardar el historial local.
- `scripting`: insertar el panel solicitado por el usuario.
- `unlimitedStorage`: permitir historiales grandes.
- `instagram.com`: recopilar las listas únicamente durante un análisis iniciado por el usuario.

## Texto de privacidad para revisión

Follow Tracker no transmite datos de seguidores a servidores propios. Los nombres de usuario, metadatos de captura, notas y etiquetas se guardan en `chrome.storage.local`. Los archivos de exportación se generan solo después de una acción explícita del usuario.

## Capturas recomendadas

1. Popup sobre un perfil listo para analizar.
2. Revisión de calidad antes de guardar.
3. Pestaña Antes y ahora.
4. Detalle individual con alias y notas.
5. Actividad filtrada.
6. Administración e importación oficial.
7. Salud del historial y recordatorio de backup.

## Nota para revisores

La extensión no automatiza acciones sociales. No realiza follow/unfollow, no publica contenido y no envía mensajes. El análisis se inicia manualmente sobre una pestaña de Instagram y requiere una decisión explícita antes de guardar el reporte.

## Aviso de marca

Follow Tracker no está afiliado, patrocinado ni aprobado por Instagram o Meta.
