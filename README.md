# Budgie

One money app for two people, backed by a Google Sheet. No bank connection.

- **App**: `index.html`, `app.js`, `themes.js`, `demo.js` (Show and tell), `sw.js` (offline). Installs from Chrome.
- **Engine**: `engine.js` works everything out from rules (pay, bills, budgets, splits). The same file runs in Apps Script.
- **Backend**: `apps-script/Code.gs` (with `engine.js` as `Engine.gs`) in the "Budgie data" Google Sheet.
- **How it fits together**: see [ARCHITECTURE.md](ARCHITECTURE.md).

Tests: `node test/engine.test.js`, `node test/backend.test.js`, `node test/scale.test.js`; browser test with `node test/server.js` then `node test/ui.test.js`.
