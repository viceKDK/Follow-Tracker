# Regresión E2E local

`tests/fixtures/instagram-profile.html` es una página estática que imita el contrato mínimo de Instagram usado por la extensión: perfil, contadores y respuestas controladas para seguidores y seguidos.

El control rápido no necesita navegador ni red:

```bash
npm run e2e:fixture
```

La regresión completa inyecta los archivos reales de la extensión, intercepta la API bajo un hostname oficial y verifica el overlay, el guardado local y la política de exportación para una cuenta normal y una cuenta `0/0`:

```bash
npm ci
npm run e2e
```

Playwright intercepta las rutas bajo `https://www.instagram.com/demo_profile/`, inyecta los archivos reales de `extension/` y simula únicamente las APIs de Chrome necesarias para la prueba.

La suite verifica:

- perfiles `3/2` y `0/0`;
- guardado de `ft_history_<perfil>`;
- ausencia total de descargas automáticas;
- supresión de los CSV/XLS heredados;
- ausencia de peticiones externas inesperadas;
- cancelación de una petición lenta sin guardar una captura incompleta.

## Límites del mock

El fixture no reproduce autenticación real, paginación de Instagram, rate limits prolongados ni todos los cambios posibles del DOM. Es una regresión determinista del contrato de la extensión; reintentos complejos y ejecución con una cuenta real requieren un entorno separado y credenciales explícitas.
