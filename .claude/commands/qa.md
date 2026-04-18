# QA — FinanceBot AI

Eres el agente de QA de FinanceBot AI. Ejecuta los siguientes checks EN ORDEN y reporta el resultado de cada uno con ✅ o ❌. No modifiques ningún archivo de código.

## Checks a ejecutar

### 6. Integridad de datos en Sheets
Valida en la hoja principal de transacciones:
- Que no existan filas completamente vacías (todas las celdas vacías).
- Que no existan transacciones duplicadas (mismo monto, fecha y descripción).
- Que los montos estén dentro de un rango razonable (por ejemplo, -100,000,000 a 100,000,000 COP).
Reporta el número de filas vacías, duplicados y montos fuera de rango. Si hay problemas, sugiere limpiar o revisar la hoja.

### 7. Validación de comandos críticos de Telegram (simulación)
Simula (dry-run) la ejecución de los siguientes comandos de Telegram y reporta si responden correctamente:
- `/metas`
- `/presupuesto`
- `/config`
- `/suscripciones`
Si algún comando falla o no responde, indica el comando y el error. Si no hay RPD de Gemini, marca la validación de Gemini como ❌ pero no detengas el resto de checks.

### 1. Archivos locales críticos
Verifica que existan estos archivos en el directorio del proyecto:
- `credentials.json` — OAuth client para clasp run
- `gas-run.js` — runner CLI
- `.clasp.json` — configuración del proyecto GAS
- `appsscript.json` — manifest de Apps Script

### 2. Configuración gas-run.js
Lee `gas-run.js` y verifica:
- Que usa `SCRIPT_ID` (no `DEPLOYMENT_ID`)
- Que usa `devMode: true`
- Reporta el valor de `SCRIPT_ID`

### 3. Scopes del token OAuth
Corre este comando y verifica que el token incluye `spreadsheets` y `gmail.modify`:
```
node -e "const fs=require('fs'),https=require('https');const t=JSON.parse(fs.readFileSync(process.env.USERPROFILE+'/.clasprc.json','utf8')).tokens.default;https.get('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token='+encodeURIComponent(t.access_token),r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>{const i=JSON.parse(d);console.log(i.error||'SCOPES: '+i.scope);});}).on('error',e=>console.log('ERR:'+e.message));"
```
Si el scope NO incluye `spreadsheets` o `gmail.modify`, indica que hay que correr `node reauth.js`.

### 4. Conectividad GAS (health check remoto)
Corre:
```
node gas-run.js run_checkSistema
```
Parsea el JSON retornado y reporta cada check individualmente:
- `credenciales` — Script Properties configuradas
- `telegram` — bot accesible
- `gemini` — API respondiendo (nota si es cuota agotada vs error real)
- `spreadsheet` — hoja accesible y cantidad de transacciones
- `triggers` — lista los triggers activos

### 5. Git status
Corre `git status` y reporta:
- Si hay archivos modificados sin commitear (advertencia, no error)
- Si hay archivos nuevos sin trackear relevantes (.gs, .json, .js)

## Formato del reporte final

Incluye los resultados de los nuevos checks en la sección REMOTO (GAS):
  ✅/❌ Integridad de datos en Sheets
  ✅/❌ Comandos críticos de Telegram

Presenta un resumen así:

```
╔══════════════════════════════════════╗
║     FINANCEBOT AI — QA REPORT        ║
╚══════════════════════════════════════╝

LOCAL
  ✅/❌ Archivos críticos
  ✅/❌ gas-run.js configurado correctamente
  ✅/❌ Token OAuth con scopes completos

REMOTO (GAS)
  ✅/❌ Credenciales (Script Properties)
  ✅/❌ Telegram — @nombreBot
  ✅/❌ Gemini — modelo / estado cuota
  ✅/❌ Google Sheets — N transacciones
  ℹ️  Triggers: [lista o NINGUNO]

GIT
  ℹ️  [archivos pendientes o "Limpio"]

════════════════════════════════════════
RESULTADO: ✅ TODO OK  /  ❌ N problema(s)
[Si hay problemas: acción concreta para cada uno]
```

Si algún check falla, da la acción exacta para resolverlo (comando a correr o paso concreto).
