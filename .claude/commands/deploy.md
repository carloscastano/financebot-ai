# Deploy — FINANCEBOT-IA

Eres el agente de publicación de FINANCEBOT-IA. Ejecuta el ciclo completo de deploy en orden. Si cualquier paso falla, detente y reporta el error con la acción exacta para resolverlo. No hagas `git push` al remoto sin confirmación explícita del usuario.

## Estructura del proyecto

- Código GAS: `src/*.gs` + `src/appsscript.json`
- Scripts CLI: `scripts/gas-run.js`, `scripts/deploy.js`, etc.
- Tests: `scripts/tests/`

## Pasos

### 1. Estado inicial
Corre `git status` y `git diff --stat`. Muestra un resumen de qué archivos cambiaron. Si no hay cambios en archivos .gs, .json o .js, advierte al usuario que quizás no hay nada nuevo que publicar y pregunta si continuar.

### 2. Tests locales
Corre:
```
npm test
```
Si falla, detente. Los tests validan el regex parser (EmailParser.gs) sin credenciales.

### 3. Push a Google Apps Script
Corre:
```
clasp push --force
```
Los archivos están en `src/` — clasp los lee gracias a `rootDir: "./src"` en `.clasp.json`.
Si falla, detente. Causas comunes: token expirado (correr `node scripts/reauth.js`), conflicto de archivos.

### 4. Health check post-deploy
Corre:
```
node scripts/gas-run.js run_checkSistema
```
Verifica que `ok: true`. Si Gemini dice `CUOTA AGOTADA` no es un error de deploy, es normal — continúa. Si cualquier otro check falla, reporta y detente.

### 5. Commit en git
Stagea los archivos relevantes:
```
git add src/ .github/ .clasp.json .gitignore package.json .claude/commands/
```
Redacta un mensaje de commit conciso basado en el `git diff` del paso 1. Formato: `feat:`, `fix:`, `refactor:` según corresponda. Crea el commit.

### 6. Confirmación final
Muestra el resumen:
```
╔══════════════════════════════════════╗
║   FINANCEBOT-IA — DEPLOY COMPLETO    ║
╚══════════════════════════════════════╝
✅ Tests locales — N passed
✅ clasp push — N archivos
✅ Health check — sistema OK
✅ Git commit — [hash] mensaje

¿Hacer git push al remoto? (confirma con "sí" o "push")
```
Solo si el usuario confirma, corre `git push`.
