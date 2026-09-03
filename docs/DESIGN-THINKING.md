# Design Thinking — Follow Tracker

## Problema que realmente resolvemos

Follow Tracker no existe para mostrar otro contador de seguidores. Existe para ayudar a una persona a responder, con evidencia y sin conclusiones apresuradas:

> ¿Qué cambió entre dos momentos, a quién afecta y qué debería revisar ahora?

La mayor amenaza del producto no es una pantalla poco atractiva. Es que una respuesta incompleta de Instagram se convierta en una conclusión falsa, o que el usuario no sepa qué hacer después de abrir el dashboard.

## Jobs to be Done

### Trabajo principal

> Cuando vuelvo a analizar mi cuenta, quiero entender qué relaciones cambiaron desde la última vez, para poder investigar a las personas relevantes sin revisar listas manualmente.

### Trabajos secundarios

1. **Confiar en el dato**: distinguir una baja confirmada de una ausencia ambigua.
2. **Reducir ruido**: encontrar una persona o grupo importante entre miles de relaciones.
3. **Conservar memoria**: recuperar el historial si reinstalo la extensión o cambio de equipo.
4. **Corregir errores**: deshacer una captura mala sin borrar todo.
5. **Entender el siguiente paso**: saber si conviene capturar, revisar, confirmar, comparar o respaldar.

## Usuarios y estados, no “personas inventadas”

Las decisiones de interfaz se organizan por el estado real de la tarea:

| Estado | Pregunta del usuario | Riesgo principal | Respuesta del producto |
|---|---|---|---|
| Sin reportes | “¿Cómo empiezo?” | No entender la línea base | Guiar a la primera captura |
| Un reporte | “¿Dónde están los cambios?” | Esperar comparación sin dos fechas | Explicar que hace falta una segunda captura |
| Captura pendiente | “¿Ya quedó guardado?” | Aceptar datos sin revisar | Priorizar la revisión antes de escribir historial |
| Ausencia pendiente | “¿Me dejó de seguir?” | Falso positivo | Explicar la ambigüedad y pedir otra captura |
| Reporte sospechoso | “¿Puedo confiar?” | Tomar decisiones con cobertura mala | Llevar a calidad y administración |
| Historial sano | “¿Qué cambió?” | Perderse entre métricas | Abrir comparación persona por persona |
| Backup vencido | “¿Puedo perder todo?” | Pérdida local | Recomendar backup en el momento correcto |

## Recorrido principal

```text
Abrir perfil
   ↓
Recopilar listas
   ↓
Revisar evidencia de calidad
   ↓
Guardar o descartar
   ↓
Ver siguiente mejor acción
   ↓
Comparar personas
   ↓
Investigar detalle
   ↓
Respaldar historial
```

## Principios de diseño

### 1. Evidencia antes que conclusión

La interfaz debe mostrar fuente, cobertura, advertencias y estado de confianza antes de afirmar que ocurrió un unfollow.

### 2. Una tarea principal por estado

El dashboard no debe presentar diez acciones con el mismo peso. La sección **Qué conviene hacer ahora** prioriza una acción y deja como secundarias solamente las siguientes dos más relevantes.

### 3. Divulgación progresiva

La pantalla principal responde qué hacer. Los detalles técnicos de cobertura, razones y cronología permanecen disponibles en paneles expandibles y en Administración.

### 4. Acciones reversibles

Guardar, deshacer, restaurar, importar y fusionar deben informar alcance y preservar un camino de recuperación cuando sea posible.

### 5. Lenguaje humano

Preferimos:

```text
Te dejó de seguir; vos todavía lo seguís
```

sobre:

```text
follower delta -1 / following true
```

### 6. Privacidad visible

Las notas, etiquetas, capturas y recomendaciones se calculan localmente. La UI debe decirlo en los momentos donde el usuario escribe o exporta información.

## Hipótesis de producto

### H1 — Siguiente mejor acción

Si el dashboard recomienda una única acción basada en el estado real, los usuarios completarán el flujo correcto con menos navegación y menos errores.

**Indicadores:**

- tiempo desde abrir dashboard hasta iniciar la tarea correcta;
- porcentaje de usuarios que completan una segunda captura;
- porcentaje que revisa una captura pendiente antes de abandonar;
- clics innecesarios entre pestañas.

### H2 — Ambigüedad explícita

Si una primera ausencia se presenta como pendiente y se explica por qué, disminuirá la interpretación de falsos unfollows.

**Indicadores:**

- falsos positivos confirmados;
- ausencias canceladas en la siguiente captura;
- reportes marcados como sospechosos que el usuario evita guardar como confiables.

### H3 — Foco en personas

Si se puede fijar, etiquetar y guardar vistas, el usuario encontrará relaciones relevantes más rápido que usando únicamente totales.

**Indicadores:**

- tiempo para localizar una persona conocida;
- uso de watchlist y vistas guardadas;
- cantidad de filtros aplicados antes de encontrar el resultado.

### H4 — Recuperación visible

Si el producto muestra el estado del último backup y ofrece rollback contextual, aumentará la confianza para mantener historial durante meses.

**Indicadores:**

- perfiles con backup reciente;
- restauraciones exitosas;
- historiales eliminados sin backup previo.

## Mejora implementada: “Qué conviene hacer ahora”

`product-guidance.js` es un motor puro que recibe únicamente hechos del dominio:

```text
cantidad de reportes
captura pendiente
calidad sospechosa
bajas pendientes
backup vencido
cambios recientes
personas fijadas
```

Devuelve una lista priorizada de acciones, con explicación y progreso. No toca el DOM ni almacenamiento.

`dashboard-guidance.js` transforma ese modelo en UI y ejecuta las acciones mediante contratos existentes del dashboard.

Esta separación permite:

- probar las decisiones sin navegador;
- modificar el orden de prioridades sin tocar HTML;
- reutilizar la lógica en popup u onboarding futuro;
- medir cada recomendación de forma independiente.

## Guion de validación con usuarios

### Sesión de 15 minutos

1. Entregar un historial con una captura pendiente.
2. Preguntar: “¿Qué harías ahora?” sin explicar la interfaz.
3. Observar si identifica la acción principal.
4. Mostrar una ausencia `1/2` y preguntar qué cree que significa.
5. Pedir que encuentre una persona fijada.
6. Pedir que respalde el historial.

### Preguntas de cierre

- ¿Qué parte te dio más confianza?
- ¿Qué frase te hizo dudar?
- ¿En qué momento pensaste que alguien te había dejado de seguir?
- ¿Qué información esperabas encontrar primero?
- ¿Qué acción te pareció irreversible?

### Criterios de éxito

- 4 de 5 participantes eligen la tarea recomendada sin ayuda.
- 5 de 5 entienden que `1/2` no es un unfollow confirmado.
- 4 de 5 encuentran una persona fijada en menos de 30 segundos.
- 5 de 5 pueden explicar dónde vive el historial y cómo respaldarlo.

## Decisiones que evitamos

Por ahora no se agregan:

- backend;
- login propio;
- automatización de follow/unfollow;
- notificaciones invasivas;
- IA que interprete relaciones personales;
- más gráficos sin una tarea concreta asociada.

Cada nueva función debe responder primero:

1. ¿Qué trabajo del usuario mejora?
2. ¿Qué evidencia demuestra que ese problema existe?
3. ¿Qué error podría provocar?
4. ¿Cómo se revierte?
5. ¿Cómo se medirá su éxito?
