# Follow Tracker 3.0 — checklist final de QA

Este documento define la validación mínima antes de publicar o distribuir Follow Tracker 3.0. La prioridad es evitar falsos unfollows, pérdida de historial, identidades duplicadas, descargas involuntarias y daños al eliminar reportes.

## 1. Instalación y migración

- [ ] Cargar `extension/` como extensión descomprimida en Chrome.
- [ ] Repetir la carga en Microsoft Edge.
- [ ] Confirmar que Manifest V3 se acepta sin archivos faltantes.
- [ ] Confirmar versión `3.0.0` en Manifest y package.
- [ ] Confirmar que los permisos se limitan a `activeTab`, `storage`, `scripting` y `unlimitedStorage`.
- [ ] Confirmar que los hosts se limitan a las dos variantes de `instagram.com`.
- [ ] Actualizar desde una instalación 2.x con perfiles reales.
- [ ] Confirmar que `ft_history_*` y `ft_timeline_*` anteriores siguen visibles.
- [ ] Confirmar que reportes anteriores aparecen como **heredados**, sin inventar puntaje de calidad.
- [ ] Confirmar que `ft_settings` se crea con dos capturas para confirmar bajas.
- [ ] Confirmar que el popup y el dashboard abren sin errores de consola.

## 2. Captura pendiente y revisión

- [ ] Abrir un perfil público con seguidores y seguidos.
- [ ] Iniciar el análisis desde el popup.
- [ ] Confirmar que aparece el panel 3.0.
- [ ] Confirmar que el progreso diferencia seguidores y seguidos.
- [ ] Confirmar que, al terminar, aparece **Revisá antes de guardar**.
- [ ] Antes de guardar, confirmar que `ft_history_<perfil>` todavía conserva la captura anterior.
- [ ] Confirmar que existe `ft_pending_capture_<perfil>`.
- [ ] Recargar Instagram y comprobar que la revisión pendiente reaparece.
- [ ] Pulsar **Descartar** y comprobar que el historial anterior no cambia.
- [ ] Repetir el análisis y pulsar **Guardar reporte**.
- [ ] Confirmar que desaparece la captura pendiente.
- [ ] Confirmar que se actualiza snapshot y timeline.
- [ ] Confirmar que el dashboard se abre tras guardar.
- [ ] Confirmar que no aparece ningún archivo automático en Descargas.

## 3. Evidencia de calidad

Validar una captura confiable:

- [ ] fuente correcta: API, UI o archivo oficial;
- [ ] contador esperado correcto;
- [ ] cantidad recolectada correcta;
- [ ] cobertura de seguidores;
- [ ] cobertura de seguidos;
- [ ] duración;
- [ ] cantidad de reintentos;
- [ ] advertencias;
- [ ] cambios detectados;
- [ ] puntaje y estado.

Validar capturas problemáticas:

- [ ] cobertura entre 80 % y 95 %: estado **Revisar**;
- [ ] cobertura menor al 80 %: estado **Rechazada**;
- [ ] caída superior al umbral: estado **Revisar**;
- [ ] cuenta con contador `0/0`: captura confiable cuando ambas listas están vacías;
- [ ] captura rechazada: botón Guardar normal deshabilitado;
- [ ] captura rechazada: se puede conservar explícitamente como sospechosa;
- [ ] reporte sospechoso visible en Resumen y Administrar;
- [ ] edición manual del estado de confianza desde Administrar.

## 4. API, reintentos y fallback visual

- [ ] Simular `429` y verificar backoff.
- [ ] Simular `502`, `503` y `504`.
- [ ] Simular timeout del perfil.
- [ ] Simular timeout de followers.
- [ ] Simular timeout de following.
- [ ] Cancelar durante el backoff.
- [ ] Confirmar que cancelar no guarda snapshot ni pending corrupto.
- [ ] Forzar fallo de API y comprobar cambio al recorrido visual.
- [ ] Confirmar que el fallback abre followers y following.
- [ ] Confirmar extracción de enlaces visibles.
- [ ] Confirmar fallback de filas sin enlace.
- [ ] Confirmar cierre del diálogo y regreso al perfil.
- [ ] Cambiar de perfil durante la captura y confirmar cancelación segura.

## 5. Confirmación de bajas

Con `confirmRemovalsAfter = 2`:

- [ ] Reporte 1: la persona aparece.
- [ ] Reporte 2: la persona falta; se mantiene en el snapshot y queda pendiente `1/2`.
- [ ] Confirmar que el Reporte 2 no crea evento `unfollowed_you`.
- [ ] Reporte 3: la persona sigue faltando; se elimina y se confirma la baja.
- [ ] Confirmar evento `unfollowed_you` solamente en Reporte 3.
- [ ] Hacer que la persona reaparezca antes del Reporte 3 y comprobar que se cancela la ausencia.
- [ ] Repetir el flujo para una cuenta que el usuario dejó de seguir.
- [ ] Cambiar la configuración a 1, 3 y 5 capturas.
- [ ] Confirmar que el contador pendiente se conserva entre reinicios del navegador.

## 6. Identidad estable y cambios de username

- [ ] Captura 1: ID `123`, username `nombre_viejo`.
- [ ] Captura 2: ID `123`, username `nombre_nuevo`.
- [ ] Confirmar una sola identidad `id:123`.
- [ ] Confirmar username canónico `nombre_viejo`.
- [ ] Confirmar username actual `nombre_nuevo`.
- [ ] Confirmar ambos alias.
- [ ] Confirmar que no existe baja de `nombre_viejo`.
- [ ] Confirmar que no existe alta independiente de `nombre_nuevo`.
- [ ] Confirmar que el dashboard muestra `@nombre_nuevo` y “Antes @nombre_viejo”.
- [ ] Confirmar que el enlace abre el username actual.
- [ ] Confirmar que buscar el alias anterior encuentra la persona.
- [ ] Probar una fila sin ID y comprobar fallback por username.
- [ ] Unir manualmente dos usernames desde Administrar.
- [ ] Confirmar que snapshots históricos, eventos, notas y tags se fusionan.

## 7. Importación oficial de Instagram

- [ ] Seleccionar `followers_1.json`.
- [ ] Seleccionar varios `followers_N.json`.
- [ ] Seleccionar `following.json`.
- [ ] Probar la variante `relationships_following`.
- [ ] Probar la variante `following_accounts`.
- [ ] Confirmar deduplicación entre archivos.
- [ ] Confirmar vista previa con totales.
- [ ] Rechazar JSON roto sin modificar datos.
- [ ] Ignorar archivo no clasificable con advertencia.
- [ ] Guardar el reporte oficial.
- [ ] Confirmar fuente `instagram_export`.
- [ ] Confirmar cobertura 100 % respecto a las listas importadas.
- [ ] Confirmar aplicación de identidad y bajas pendientes.
- [ ] Confirmar comparación con reportes API/UI existentes.

## 8. Antes y ahora

- [ ] Comparar último reporte con anterior.
- [ ] Comparar primero con último.
- [ ] Comparar reportes intermedios.
- [ ] Confirmar orden anterior → actual.
- [ ] Confirmar columnas de relación anterior y actual.
- [ ] Confirmar frases de cambio exactas.
- [ ] Buscar con y sin `@`.
- [ ] Buscar username actual.
- [ ] Buscar alias anterior.
- [ ] Probar filtros rápidos.
- [ ] Probar estado actual.
- [ ] Probar tipo exacto de cambio.
- [ ] Probar orden por todas las columnas.
- [ ] Probar densidad compacta y normal.
- [ ] Probar páginas de 100, 250 y 500.
- [ ] Abrir una fila con clic, Enter y Espacio.
- [ ] Cerrar panel con botón, fondo y Escape.
- [ ] Exportar CSV y confirmar que respeta filtros activos.

## 9. Personas, notas, etiquetas y fijados

- [ ] Abrir persona con historial.
- [ ] Abrir persona sin eventos.
- [ ] Guardar una nota.
- [ ] Guardar una etiqueta.
- [ ] Guardar varias etiquetas.
- [ ] Confirmar máximo de 12 etiquetas.
- [ ] Fijar persona.
- [ ] Confirmar estrella en la tabla.
- [ ] Confirmar tags visibles.
- [ ] Filtrar por **Fijados**.
- [ ] Desfijar y comprobar salida del filtro.
- [ ] Cambiar de persona y confirmar que el mensaje de guardado no se mezcla con los alias.
- [ ] Cerrar y reabrir dashboard; confirmar persistencia.
- [ ] Exportar/importar backup; confirmar restauración de notas y fijados.

## 10. Actividad

- [ ] Buscar por usuario actual.
- [ ] Buscar por ID de reporte.
- [ ] Filtrar por cada evento.
- [ ] Filtrar por reporte.
- [ ] Filtrar por fecha desde y hasta.
- [ ] Combinar todos los filtros.
- [ ] Probar páginas de 50, 100, 250 y 500.
- [ ] Navegar sin repetir ni perder eventos.
- [ ] Exportar la vista filtrada.
- [ ] Confirmar que la fecha se presenta como fecha de detección.

## 11. Administración de perfiles

- [ ] Ver todos los perfiles.
- [ ] Confirmar total de reportes.
- [ ] Confirmar personas actuales.
- [ ] Confirmar tamaño local estimado.
- [ ] Guardar etiqueta local.
- [ ] Archivar perfil.
- [ ] Desarchivar perfil.
- [ ] Abrir perfil desde Administrar.
- [ ] Exportar perfil.
- [ ] Eliminar perfil y todos sus sidecars.
- [ ] Confirmar que eliminar uno no afecta otro.

## 12. Fusión de perfiles

- [ ] Preparar dos perfiles del mismo usuario con fechas distintas.
- [ ] Fusionar origen dentro de destino.
- [ ] Confirmar orden cronológico.
- [ ] Confirmar deduplicación de report IDs.
- [ ] Confirmar recalculado de deltas.
- [ ] Confirmar unión de metadatos de calidad.
- [ ] Confirmar unión de identidades.
- [ ] Confirmar unión de notas y fijados.
- [ ] Confirmar eliminación de todas las claves del origen.
- [ ] Confirmar backup del destino fusionado.

## 13. Administración de reportes

- [ ] Editar etiqueta de un reporte.
- [ ] Editar nota breve.
- [ ] Cambiar estado de confianza.
- [ ] Confirmar fuente y puntaje.
- [ ] Eliminar el último reporte mediante Administrar.
- [ ] Eliminar un reporte intermedio.
- [ ] Confirmar que el timeline conserva los restantes.
- [ ] Confirmar que el snapshot actual sigue coincidiendo con el último reporte.
- [ ] Confirmar recalculado correcto de eventos/deltas posteriores.
- [ ] Confirmar que recovery y backup status se invalidan tras reconstruir.
- [ ] Impedir eliminar el único reporte.

## 14. Rollback rápido

- [ ] Deshacer el último reporte.
- [ ] Confirmar snapshot anterior exacto.
- [ ] Confirmar eliminación de eventos del reporte deshecho.
- [ ] Confirmar creación de `ft_recovery_*`.
- [ ] Restaurar una vez.
- [ ] Confirmar eliminación del recovery después de restaurar.
- [ ] Crear un reporte nuevo después del rollback y confirmar recovery obsoleto.
- [ ] Descartar recovery obsoleto.
- [ ] Borrar perfil y confirmar eliminación del recovery.

## 15. Backup y restauración

### Perfil individual

- [ ] Exportar backup completo.
- [ ] Confirmar snapshot y timeline.
- [ ] Confirmar capture metadata.
- [ ] Confirmar identity registry.
- [ ] Confirmar absence state.
- [ ] Confirmar people metadata.
- [ ] Confirmar profile metadata.
- [ ] Confirmar settings.
- [ ] Borrar perfil y restaurar.
- [ ] Confirmar paridad completa.

### Espacio de trabajo

- [ ] Exportar todos los perfiles.
- [ ] Confirmar lista de perfiles.
- [ ] Restaurar en almacenamiento vacío.
- [ ] Confirmar settings globales.
- [ ] Probar reemplazo de perfil existente.
- [ ] Cancelar reemplazo.

### Compatibilidad

- [ ] Importar backup 2.x con snapshot/timeline.
- [ ] Importar snapshot heredado sin timeline.
- [ ] Rechazar JSON inválido.
- [ ] Rechazar perfiles mezclados.
- [ ] Rechazar timeline con reportes y sin baseline.
- [ ] Rechazar archivo mayor de 100 MB.

### Recordatorio

- [ ] Sin backup previo: aviso visible.
- [ ] Cinco reportes nuevos: aviso visible.
- [ ] Treinta días: aviso visible.
- [ ] Exportar y confirmar estado “Backup al día”.

## 16. Salud estructural y calidad de captura

No confundir ambos conceptos.

### Salud estructural

- [ ] Historial consistente: 100/100.
- [ ] Perfil mezclado: error.
- [ ] Baseline ausente: error.
- [ ] IDs duplicados: advertencia.
- [ ] Fecha inválida: advertencia.
- [ ] Descargar diagnóstico.

### Calidad de captura

- [ ] Fuente visible.
- [ ] Cobertura visible.
- [ ] Puntaje visible.
- [ ] Razones visibles.
- [ ] Renombres visibles.
- [ ] Bajas pendientes visibles.
- [ ] Reporte heredado no recibe evidencia inventada.

## 17. Volumen y rendimiento

- [ ] 10.000 personas actuales.
- [ ] 100.000 eventos.
- [ ] 400 reportes.
- [ ] 10.000 identidades con alias.
- [ ] 1.000 notas/fijados.
- [ ] Abrir tablas sin congelamiento prolongado.
- [ ] Filtrar y ordenar con fluidez aceptable.
- [ ] Usar 500 filas por página.
- [ ] Importar JSON oficial grande.
- [ ] Exportar backup completo grande.
- [ ] Fusionar dos timelines grandes sin pérdida.
- [ ] Confirmar que no se insertan todas las filas en el DOM.

## 18. Exportaciones y CSV

- [ ] Ningún análisis crea CSV/XLS/JSON automáticamente.
- [ ] No existen `content.js` ni `export-policy.js` en el paquete.
- [ ] Backup se descarga solo mediante acción explícita.
- [ ] Actividad CSV solo mediante acción explícita.
- [ ] Relaciones CSV solo mediante acción explícita.
- [ ] Comparación CSV respeta filtros.
- [ ] Actividad filtrada respeta filtros.
- [ ] Diagnóstico JSON mediante acción explícita.
- [ ] Neutralizar celdas que empiezan con `=`, `+`, `-` o `@`.
- [ ] Escapar comas, comillas y saltos de línea.

## 19. Privacidad y seguridad

- [ ] No hay backend propio.
- [ ] No hay analytics de seguidores.
- [ ] No se guarda contraseña.
- [ ] No hay follow/unfollow.
- [ ] No hay mensajes ni publicaciones.
- [ ] No hay código remoto.
- [ ] No hay `eval()` ni `new Function()`.
- [ ] Datos en `chrome.storage.local`.
- [ ] Archivos oficiales procesados localmente.
- [ ] Notas privadas incluidas solamente en backup explícito.
- [ ] Política de privacidad coincide con el comportamiento real.

## 20. Accesibilidad y responsive

- [ ] Navegar popup con teclado.
- [ ] Navegar overlay con teclado.
- [ ] Navegar dashboard con teclado.
- [ ] Foco visible.
- [ ] Tabs con `aria-selected`.
- [ ] Estado de guardado con `aria-live`.
- [ ] Revisión usable a 390 px.
- [ ] Dashboard a 390, 768, 1024 y 1440 px.
- [ ] Scroll horizontal controlado para tablas.
- [ ] `prefers-reduced-motion` respetado.

## 21. Empaquetado y release

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run e2e:fixture
npm run e2e
npm run package
```

Confirmar:

- [ ] todos los comandos terminan en 0;
- [ ] `dist/follow-tracker-3.0.0.zip` existe;
- [ ] ZIP no contiene tests;
- [ ] ZIP no contiene archivos heredados;
- [ ] ZIP contiene política/runtime necesarios;
- [ ] SHA-256 coincide;
- [ ] `release-manifest.json` lista archivos correctos;
- [ ] instalar directamente desde el contenido del ZIP;
- [ ] workflow de tag `v*` genera artifact y release;
- [ ] ficha de tienda coincide con permisos y funciones.

## Criterio de salida

Follow Tracker 3.0 puede considerarse listo cuando:

1. ninguna captura modifica el historial antes de una decisión;
2. una captura parcial no inventa bajas confirmadas;
3. un cambio de username con ID estable conserva una persona;
4. la importación oficial produce reportes comparables;
5. eliminar un reporte intermedio reconstruye el timeline;
6. perfiles, notas, identidades y configuración se restauran desde backup;
7. el análisis no genera descargas automáticas;
8. el paquete final contiene solamente el runtime necesario;
9. CI completa unitarios, navegador y packaging;
10. la validación manual con una sesión real de Instagram no presenta errores críticos.
