# Regresión E2E local

`tests/fixtures/instagram-profile.html` es una página estática que imita el mínimo contrato de Instagram usado por la extensión: perfil, botones de seguidores/seguidos, diálogos y filas con `data-username`.

El control rápido no necesita navegador ni red:

```bash
npm run e2e:fixture
```

La regresion completa inyecta los archivos reales de la extension, intercepta
la API bajo un hostname oficial y verifica overlay, descargas e historial para
una cuenta normal y una cuenta `0/0`:

```bash
npm ci
npm run e2e
```

La configuración usa el canal estable de Google Chrome disponible tanto en
Windows local como en los runners `windows-latest` de GitHub Actions. Playwright
intercepta las rutas bajo `https://www.instagram.com/demo_profile/`, inyecta los
archivos reales de la extensión y simula únicamente las APIs de Chrome.

La suite verifica perfiles `3/2` y `0/0`, las tres descargas, el historial,
la ausencia de peticiones externas y la cancelación de una petición lenta.

## Límites del mock

El fixture no reproduce autenticación, API privada, paginación ni cambios de DOM de Instagram. Es una regresión determinista del contrato UI; los casos de reintentos/API y la ejecución con una cuenta real requieren un entorno separado y credenciales explícitas.
