# Follow Tracker 2.1 — checklist final de QA

Este documento define la validación mínima antes de considerar una versión lista para uso real. La prioridad es evitar falsos unfollows, pérdida de historial, descargas involuntarias y bloqueos del dashboard con listas grandes.

## 1. Instalación y permisos

- [ ] Cargar `extension/` como extensión descomprimida en Chrome.
- [ ] Repetir la carga en Microsoft Edge.
- [ ] Confirmar que Manifest V3 se acepta sin advertencias de archivos faltantes.
- [ ] Confirmar que los únicos permisos son `activeTab`, `storage`, `scripting` y `unlimitedStorage`.
- [ ] Confirmar que el host permitido se limita a `instagram.com`.
- [ ] Confirmar que el popup abre sin errores de consola.
- [ ] Confirmar que el dashboard abre desde el popup y desde la página de opciones.

## 2. Primer análisis

- [ ] Abrir un perfil público con seguidores y seguidos.
- [ ] Iniciar el análisis desde el popup.
- [ ] Confirmar que aparece el panel flotante.
- [ ] Confirmar que el progreso diferencia seguidores y seguidos.
- [ ] Cancelar una ejecución y comprobar que no reemplaza la captura válida.
- [ ] Ejecutar nuevamente y completar el análisis.
- [ ] Confirmar que se crea `ft_history_<perfil>`.
- [ ] Confirmar que se crea `ft_timeline_<perfil>`.
- [ ] Confirmar que la primera captura aparece como línea base.
- [ ] Confirmar que no aparece ningún archivo automático en Descargas.

## 3. Capturas incompletas y errores de Instagram

- [ ] Simular `429` y verificar espera/reintento controlado.
- [ ] Simular `503` y verificar mensaje comprensible.
- [ ] Interrumpir la red durante seguidores.
- [ ] Interrumpir la red durante seguidos.
- [ ] Confirmar que una lista con cobertura insuficiente no genera falsos cambios.
- [ ] Confirmar que una cuenta con cero seguidores y cero seguidos se acepta cuando Instagram informa ambos contadores en cero.
- [ ] Confirmar fallback visual cuando la API no entrega cobertura suficiente.
- [ ] Cambiar de perfil durante el análisis y verificar cancelación segura.
- [ ] Cerrar la pestaña durante el análisis y confirmar que el último historial válido sigue intacto.

## 4. Segundo análisis y eventos

Preparar dos capturas controladas donde exista al menos un caso de cada tipo:

- [ ] una persona empieza a seguirte;
- [ ] una persona te deja de seguir;
- [ ] empezás a seguir a una persona;
- [ ] dejás de seguir a una persona;
- [ ] una relación pasa de mutua a “lo seguís; no te sigue”;
- [ ] una relación pasa de mutua a “te sigue; no lo seguís”;
- [ ] dos personas pasan a seguirse mutuamente;
- [ ] dos personas dejan de seguirse.

Verificar que:

- [ ] cada evento se crea una sola vez;
- [ ] el evento conserva `reportId` y `runId`;
- [ ] repetir la misma captura no duplica el reporte;
- [ ] la actividad se ordena desde el evento más reciente;
- [ ] la fecha se presenta como fecha de detección, no como instante exacto del cambio.

## 5. Antes y ahora

- [ ] Comparar el último reporte con el anterior.
- [ ] Comparar el primer reporte con el último.
- [ ] Comparar dos reportes intermedios.
- [ ] Confirmar que el selector normaliza el orden anterior → actual.
- [ ] Confirmar las columnas “Antes” y “Ahora” para cada persona.
- [ ] Confirmar los mensajes de cambio exactos.
- [ ] Probar búsqueda con y sin `@`.
- [ ] Probar todos los filtros rápidos.
- [ ] Probar filtro por estado actual.
- [ ] Probar filtro por tipo exacto de cambio.
- [ ] Probar orden ascendente y descendente por cada columna.
- [ ] Probar densidad compacta y normal.
- [ ] Abrir una fila mediante clic, Enter y Espacio.
- [ ] Cerrar el panel lateral con botón, fondo y Escape.
- [ ] Confirmar que el CSV exportado respeta todos los filtros activos.

## 6. Personas

- [ ] Buscar una cuenta existente.
- [ ] Buscar una cuenta inexistente.
- [ ] Probar los seis filtros.
- [ ] Ordenar por usuario, relación, cambios y último evento.
- [ ] Abrir una persona con historial.
- [ ] Abrir una persona sin eventos históricos.
- [ ] Confirmar el enlace a Instagram.
- [ ] Confirmar que una cuenta que ya no aparece en ninguna lista sigue disponible como histórica.

## 7. Actividad

- [ ] Buscar por usuario.
- [ ] Buscar por ID de reporte.
- [ ] Filtrar por cada tipo de evento.
- [ ] Filtrar por un reporte específico.
- [ ] Filtrar por fecha desde.
- [ ] Filtrar por fecha hasta.
- [ ] Combinar búsqueda, tipo, reporte y fechas.
- [ ] Probar tamaños de página 50, 100, 250 y 500.
- [ ] Navegar entre páginas sin repetir ni perder eventos.
- [ ] Limpiar filtros.
- [ ] Exportar la vista filtrada y comprobar el contenido.

## 8. Volumen y rendimiento

Usar datos sintéticos o un backup de prueba grande.

- [ ] 10.000 personas en la captura actual.
- [ ] 100.000 eventos en la línea temporal.
- [ ] 400 reportes.
- [ ] Abrir Antes y ahora sin congelamiento prolongado.
- [ ] Cambiar filtros y páginas sin bloquear el navegador.
- [ ] Abrir Personas y ordenar una columna.
- [ ] Abrir Actividad y cambiar a 500 filas por página.
- [ ] Confirmar que nunca se intentan insertar todas las filas en el DOM simultáneamente.
- [ ] Confirmar que exportar una vista grande no modifica el historial.

## 9. Backup y restauración

- [ ] Exportar Backup JSON.
- [ ] Borrar el historial del perfil.
- [ ] Importar el backup.
- [ ] Confirmar captura, reportes, eventos y comparaciones restauradas.
- [ ] Importar un snapshot heredado sin timeline y confirmar creación de línea base.
- [ ] Rechazar JSON inválido.
- [ ] Rechazar backup sin `followers` o `following`.
- [ ] Rechazar captura y timeline de perfiles distintos.
- [ ] Rechazar timeline con reportes y sin baseline.
- [ ] Pedir confirmación antes de reemplazar un perfil existente.
- [ ] Rechazar archivos de más de 25 MB con mensaje comprensible.

## 10. Salud del historial

- [ ] Historial consistente: puntaje 100 y estado saludable.
- [ ] Perfil mezclado: estado de error.
- [ ] Baseline ausente: estado de error.
- [ ] Usuario duplicado: advertencia.
- [ ] ID de reporte duplicado: advertencia.
- [ ] ID de evento duplicado: advertencia.
- [ ] Evento con tipo desconocido: advertencia.
- [ ] Total del último reporte distinto a la captura: advertencia.
- [ ] Descargar diagnóstico JSON.

## 11. Exportaciones y seguridad de CSV

- [ ] Ningún análisis genera CSV o XLS automáticamente.
- [ ] Backup JSON se descarga solo al pulsar Exportar.
- [ ] Actividad CSV se descarga solo al pulsar Exportar.
- [ ] Relaciones CSV se descarga solo al pulsar Exportar.
- [ ] Comparación y actividad filtrada se descargan solo desde sus botones.
- [ ] Un username que empiece con `=`, `+`, `-` o `@` no se interpreta como fórmula en Excel.
- [ ] Comas, comillas y saltos de línea se escapan correctamente.

## 12. Privacidad y borrado

- [ ] No se realizan solicitudes a servidores propios.
- [ ] No se envían snapshots a analytics.
- [ ] No se guarda contraseña de Instagram.
- [ ] No existen acciones de follow/unfollow/mensajería.
- [ ] Borrar un perfil elimina `ft_history_<perfil>` y `ft_timeline_<perfil>`.
- [ ] Borrar un perfil no elimina datos de otros perfiles.
- [ ] La UI explica que borrar no modifica Instagram.

## 13. Accesibilidad y responsive

- [ ] Navegar el dashboard solamente con teclado.
- [ ] Confirmar foco visible en botones, tablas, inputs y selects.
- [ ] Confirmar que los tabs informan `aria-selected`.
- [ ] Probar ancho 1440 px.
- [ ] Probar ancho 1024 px.
- [ ] Probar ancho 768 px.
- [ ] Probar ancho 390 px.
- [ ] Confirmar scroll horizontal controlado para tablas.
- [ ] Confirmar comportamiento con `prefers-reduced-motion`.

## 14. Automatización obligatoria

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run e2e:fixture
npm run e2e
```

Todos los comandos deben finalizar con código 0 antes de publicar una versión.

## Criterio de salida

La versión puede considerarse lista cuando:

1. no genera falsos unfollows con capturas incompletas;
2. no descarga archivos automáticamente;
3. puede restaurar un backup válido;
4. mantiene fluidez con listas grandes gracias a la paginación;
5. detecta inconsistencias de almacenamiento;
6. todas las pruebas automatizadas y manuales críticas están aprobadas.
