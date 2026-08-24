# Migración a Follow Tracker 3.0

## Compatibilidad

Follow Tracker 3.0 mantiene las claves existentes:

```text
ft_history_<perfil>
ft_timeline_<perfil>
```

Por eso, los historiales 2.x continúan apareciendo al actualizar la extensión.

Las funciones nuevas se guardan en claves laterales:

```text
ft_capture_meta_<perfil>
ft_identity_<perfil>
ft_absence_<perfil>
ft_people_meta_<perfil>
ft_profile_meta_<perfil>
ft_backup_status_<perfil>
ft_pending_capture_<perfil>
```

Un reporte anterior sin `ft_capture_meta_*` se muestra como **reporte heredado**. No se inventa un puntaje de calidad retroactivo.

## Qué cambia al analizar

En 2.x, el análisis guardaba automáticamente una captura completa.

En 3.0:

```text
recolectar
→ calcular cobertura e identidades
→ mostrar revisión
→ guardar o descartar
```

Hasta que el usuario confirma, `ft_history_<perfil>` no se modifica.

## Confirmación de bajas

La configuración predeterminada requiere dos capturas completas consecutivas para confirmar una desaparición.

Ejemplo:

```text
Reporte 1: @persona está
Reporte 2: @persona falta → baja pendiente
Reporte 3: @persona sigue faltando → baja confirmada
```

Esto puede cambiarse desde **Administrar → Reglas de captura**.

## Cambios de username

Cuando Instagram entrega el mismo ID numérico para dos usernames, Follow Tracker conserva el username original como identificador canónico y muestra el username actual en la interfaz.

Los reportes 2.x no contienen IDs. La primera captura 3.0 crea el registro estable para las cuentas que la API identifica.

Si un cambio no se detectó automáticamente:

```text
Administrar
→ Identidades
→ Username anterior
→ Username actual
→ Unir identidad
```

## Backups

Los backups 3.0 incluyen:

- snapshot actual;
- timeline;
- metadatos de calidad;
- identidades y alias;
- bajas pendientes;
- notas, etiquetas y fijados;
- metadatos del perfil;
- configuración.

Los backups 2.x que solo contienen `snapshot` y `timeline` siguen siendo importables.

## Content script heredado

Los archivos `content.js` y `export-policy.js` de 2.x se retiran del paquete 3.0. La extensión ahora usa módulos separados y no construye CSV/XLS durante el análisis.

## Recomendación de actualización

1. Exportá un backup desde la versión actual.
2. Actualizá o recargá la extensión.
3. Abrí el dashboard y comprobá que tus perfiles aparecen.
4. Ejecutá una captura 3.0 para inicializar identidades y evidencia de calidad.
5. Descargá un nuevo backup completo.
