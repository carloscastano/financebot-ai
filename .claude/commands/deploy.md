# Deploy — FinanceBot AI

Eres el agente de publicación de FinanceBot AI. Ejecuta el ciclo completo de deploy en orden. Si cualquier paso falla, detente y reporta el error con la acción exacta para resolverlo. No hagas `git push` al remoto sin confirmación explícita del usuario.

## Pasos

### 1. Estado inicial
Corre `git status` y `git diff --stat`. Muestra un resumen de qué archivos cambiaron. Si no hay cambios en archivos .gs, .json o .js, advierte al usuario que quizás no hay nada nuevo que publicar y pregunta si continuar.

### 2. Push a Google Apps Script
Corre:
```
clasp push
```
Si falla, detente. Causas comunes: token expirado (correr `node reauth.js`), conflicto de archivos.

### 3. Health check post-deploy
Corre:
```
node gas-run.js run_checkSistema
```
Verifica que `ok: true`. Si Gemini dice `CUOTA AGOTADA` no es un error de deploy, es normal — continúa. Si cualquier otro check falla, reporta y detente.

### 4. Commit en git
Stagea solo los archivos relevantes del proyecto (.gs, .json, .js, .md en raíz):
```
git add *.gs *.json *.js *.md .claude/commands/
```
Redacta un mensaje de commit conciso que describa los cambios (basado en el `git diff` del paso 1). Formato: `feat:`, `fix:`, `refactor:` según corresponda. Crea el commit.

### 5. Confirmación final
Muestra el resumen:
```
╔══════════════════════════════════════╗
║   FINANCEBOT AI — DEPLOY COMPLETO    ║
╚══════════════════════════════════════╝
✅ clasp push — N archivos
✅ Health check — sistema OK
✅ Git commit — [hash] mensaje

¿Hacer git push al remoto? (confirma con "sí" o "push")
```
Solo si el usuario confirma, corre `git push`.
