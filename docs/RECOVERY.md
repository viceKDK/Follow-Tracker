# Recuperación de reportes

Follow Tracker permite deshacer el último reporte completo sin borrar todo el historial del perfil.

## Cuándo usarlo

Usá **Deshacer último reporte** cuando:

- Instagram entregó datos extraños aunque la captura fue aceptada;
- querés eliminar el último análisis de prueba;
- detectaste que el último reporte no representa el estado real;
- necesitás volver al reporte anterior antes de ejecutar otro análisis.

## Qué hace

Al deshacer:

1. reconstruye la captura exacta del reporte anterior;
2. quita del timeline el último reporte;
3. elimina únicamente los eventos pertenecientes a ese reporte;
4. conserva la línea base y todos los reportes anteriores;
5. guarda un punto de recuperación local con el reporte eliminado.

No modifica seguidores, seguidos ni ninguna información dentro de Instagram.

## Restaurar el reporte deshecho

Después de deshacer aparece **Restaurar reporte deshecho**.

La restauración solamente está disponible mientras el historial siga exactamente en el reporte objetivo. Si ejecutás un análisis nuevo o el timeline cambia, el punto queda marcado como vencido para evitar sobrescribir datos posteriores.

El punto de recuperación puede descartarse manualmente. También se elimina cuando se borra por completo el historial del perfil.

## Alcance

- se conserva un único punto de recuperación por perfil;
- un segundo rollback reemplaza el punto anterior;
- la función no sirve para borrar arbitrariamente un reporte intermedio;
- para cambios complejos o traslado entre dispositivos, usá **Backup JSON**.

## Recomendación

Antes de corregir un historial importante, exportá un Backup JSON. El rollback es una protección rápida; el backup sigue siendo la copia durable que podés guardar fuera del navegador.
