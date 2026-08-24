# Política de privacidad de Follow Tracker

Última actualización: 24 de agosto de 2026

## Resumen

Follow Tracker es una extensión local para comparar capturas de seguidores y seguidos de Instagram. No requiere una cuenta de Follow Tracker y no opera un servidor propio para recibir los datos analizados.

## Datos que procesa

La extensión puede procesar, cuando el usuario inicia un análisis:

- nombre del perfil abierto;
- nombres de usuario visibles en las listas de seguidores y seguidos;
- identificadores numéricos de Instagram cuando la respuesta del sitio los incluye;
- nombre visible de una cuenta;
- fecha, fuente y cobertura de una captura;
- notas y etiquetas escritas por el usuario dentro de Follow Tracker.

## Dónde se guardan

Los datos se guardan en `chrome.storage.local`, dentro del navegador donde está instalada la extensión.

Follow Tracker no envía estos datos a una API, base de datos o servicio de analítica propio.

Los backups JSON y CSV se crean únicamente cuando el usuario pulsa un botón de exportación. Desde ese momento, el archivo queda bajo control del usuario y de la ubicación donde lo haya guardado.

## Permisos

La extensión solicita:

- `activeTab`: para detectar el perfil abierto cuando el usuario pulsa la extensión;
- `storage`: para guardar el historial local;
- `scripting`: para cargar el panel de análisis cuando corresponde;
- `unlimitedStorage`: para conservar historiales grandes sin depender del límite pequeño de almacenamiento sincronizado;
- acceso a `instagram.com`: únicamente para ejecutar el análisis solicitado por el usuario.

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

El usuario puede seleccionar manualmente archivos JSON de una descarga oficial de Instagram. Estos archivos se leen en el navegador y se convierten en un reporte local. No se suben a un servidor de Follow Tracker.

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
