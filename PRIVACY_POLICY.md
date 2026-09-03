# Política de privacidad de Follow Tracker

Última actualización: 1 de septiembre de 2026

## Resumen

Follow Tracker es una extensión local para comparar capturas de seguidores y seguidos de Instagram. No requiere una cuenta de Follow Tracker y no opera un servidor propio para recibir los datos analizados.

## Datos que procesa

La extensión puede procesar, cuando el usuario inicia un análisis:

- nombre del perfil abierto;
- nombres de usuario visibles en las listas de seguidores y seguidos;
- identificadores numéricos de Instagram cuando la respuesta del sitio los incluye;
- nombre visible de una cuenta;
- fecha, fuente, métricas y cobertura de una captura;
- aliases de username utilizados para evitar falsas altas y bajas;
- notas y etiquetas escritas por el usuario dentro de Follow Tracker.

## Dónde se guardan

Los datos se guardan en `chrome.storage.local`, dentro del navegador donde está instalada la extensión.

Follow Tracker no envía estos datos a una API, base de datos o servicio de analítica propio.

Los backups JSON y CSV se crean únicamente cuando el usuario pulsa un botón de exportación. Desde ese momento, el archivo queda bajo control del usuario y de la ubicación donde lo haya guardado.

El almacenamiento tiene una versión interna. Antes de una migración, Follow Tracker crea un respaldo local verificable de las claves que modificará y restaura ese respaldo si la migración falla.

## Permisos

La extensión solicita únicamente:

- `activeTab`: para detectar el perfil abierto cuando el usuario pulsa la extensión;
- `storage`: para guardar el historial, las revisiones de calidad y los backups de migración dentro del navegador;
- acceso a `instagram.com`: únicamente para ejecutar el análisis solicitado por el usuario.

La extensión no solicita `scripting`, `unlimitedStorage`, acceso a cookies, historial de navegación, todas las pestañas ni todos los sitios. El panel se carga mediante scripts de contenido declarados exclusivamente para Instagram.

## Acciones que no realiza

Follow Tracker no:

- solicita ni almacena la contraseña de Instagram;
- inicia sesión por el usuario;
- sigue o deja de seguir cuentas;
- envía mensajes;
- publica contenido;
- vende datos;
- crea perfiles publicitarios;
- ejecuta análisis automáticos en segundo plano.

## Importación oficial

El usuario puede seleccionar manualmente archivos JSON de una descarga oficial de Instagram. Estos archivos se leen en el navegador, se normalizan y se convierten en un reporte local. No se suben a un servidor de Follow Tracker.

## Capturas incompletas

Follow Tracker registra cobertura, registros inválidos, duplicados y final de paginación. Una captura incompleta puede aportar presencias nuevas, pero no tiene autoridad para confirmar ausencias como bajas. Esta regla reduce falsos `unfollow` sin enviar datos fuera del navegador.

## Conservación y eliminación

El historial permanece hasta que el usuario:

- borra un perfil desde el dashboard;
- elimina la extensión;
- limpia los datos de la extensión desde el navegador.

Antes de eliminar datos, el usuario puede descargar un backup completo.

## Terceros

Follow Tracker no está afiliado, patrocinado ni aprobado por Instagram o Meta.

La extensión interactúa con la sesión de Instagram abierta en el navegador. El uso de Instagram también está sujeto a las políticas y condiciones de Meta.

## Cambios

Los cambios materiales a esta política se documentarán en este archivo y en las notas de versión del repositorio.

## Contacto

Para reportar un problema de privacidad, use la sección Issues del repositorio oficial de Follow Tracker en GitHub.
