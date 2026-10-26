// A small stand-in for the Apps Script services Code.gs uses, so it can be tested locally.
const vm = require("vm"), fs = require("fs"), path = require("path");
function chain() { const o = new Proxy(function () {}, {get: (t, k) => k === "then" ? undefined : () => o, apply: () => o}); return o; }
function makeEnv() {
  const sheets = {}, props = {}, logs = [];
  function Sheet(name) {
    const s = {name, cells: []};
    const range = (r, c, nr = 1, nc = 1) => {
      const g = {
        getValues: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => ((s.cells[r - 1 + i] || [])[c - 1 + j]) ?? "")),
        setValues: (v) => { v.forEach((row, i) => row.forEach((x, j) => { (s.cells[r - 1 + i] = s.cells[r - 1 + i] || [])[c - 1 + j] = parseIn(x); })); return g; },
        setValue: (x) => { (s.cells[r - 1] = s.cells[r - 1] || [])[c - 1] = parseIn(x); return g; },
        setFontWeight: () => g, setBackground: () => g, setNote: () => g, setFontSize: () => g, setNumberFormat: () => g, setFontColor: () => g,
        protect: () => ({setWarningOnly: () => {}})
      };
      return g;
    };
    const api = {
      getName: () => name, getRange: range,
      getDataRange: () => { const w = Math.max(1, ...s.cells.map(r => (r || []).length)); return range(1, 1, Math.max(1, s.cells.length), w); },
      getLastColumn: () => Math.max(0, ...s.cells.map(r => (r || []).length)), getLastRow: () => s.cells.length,
      appendRow: (row) => { s.cells.push(row.map(parseIn)); },
      setFrozenRows: () => {}, setFrozenColumns: () => {}, setColumnWidth: () => {}, clear: () => { s.cells = []; }, _s: s
    };
    return api;
  }
  // like typing into a cell: ISO date strings become dates
  function parseIn(x) { if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) { const [y, m, d] = x.split("-").map(Number); return new Date(y, m - 1, d); } return x; }
  const ss = {
    getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = Sheet(n)), getSpreadsheetTimeZone: () => "Europe/London", getSheets: () => Object.values(sheets),
    getName: () => "Untitled spreadsheet", rename: () => {}, setSpreadsheetTimeZone: () => {}, deleteSheet: (s) => { delete sheets[s.getName()]; }
  };
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error,
    SpreadsheetApp: {getActiveSpreadsheet: () => ss, openById: () => ss, flush: () => {}},
    PropertiesService: {getScriptProperties: () => ({getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, getProperties: () => ({...props})})},
    LockService: {getScriptLock: () => ({waitLock: () => {}, releaseLock: () => {}})},
    ContentService: {createTextOutput: (t) => ({setMimeType: () => ({text: t, json: () => JSON.parse(t)})}), MimeType: {JSON: "json"}},
    Utilities: {
      formatDate: (d, tz, f) => f === "yyyy-MM-dd" ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : d.toISOString(),
      getUuid: () => require("crypto").randomUUID(), base64EncodeWebSafe: (s) => Buffer.from(s).toString("base64url")
    },
    Logger: {log: (x) => logs.push(String(x))},
    ScriptApp: {getService: () => ({getUrl: () => "https://script.google.com/macros/s/TEST/exec"}), getProjectTriggers: () => [], newTrigger: chain, deleteTrigger: () => {}}
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, "..");
  vm.runInContext(fs.readFileSync(path.join(dir, "engine.js"), "utf8"), ctx, {filename: "Engine.gs"});
  vm.runInContext(fs.readFileSync(path.join(dir, "apps-script/Code.gs"), "utf8"), ctx, {filename: "Code.gs"});
  return {ctx, sheets, props, logs, ss};
}
module.exports = makeEnv;
