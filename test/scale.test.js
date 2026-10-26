// Ten years of daily spending for two people: the views must stay quick.
const B = require("../engine.js"), fixture = require("./fixture.js");
const t = fixture(); let n = 0, seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
for (let d = "2026-10-27"; d < "2036-10-27"; d = B.addDays(d, 1)) {
  if (rnd() < 0.5) t.transactions.push({id: "x" + n++, date: d, person: "ethan", amount: +(5 + rnd() * 30).toFixed(2), budget: rnd() < 0.6 ? "e-food-b" : "e-fun", account: rnd() < 0.8 ? "e-food" : "e-main"});
  if (rnd() < 0.5) t.transactions.push({id: "x" + n++, date: d, person: "sophie", amount: +(3 + rnd() * 20).toFixed(2), budget: "s-food", account: "s-main", split: rnd() < 0.1 ? "half" : ""});
}
let s = Date.now(); const db = B.load(t); const load = Date.now() - s;
s = Date.now(); const v = B.today(db, "ethan", "2036-10-20"); const first = Date.now() - s;
s = Date.now(); B.today(db, "ethan", "2036-10-20"); B.pots(db, "ethan", "2036-10-20"); B.summary(db, "sophie", "2036-10-20"); const again = Date.now() - s;
console.log(t.transactions.length + " payments · load " + load + " ms · first Today " + first + " ms · again " + again + " ms · safe £" + v.safe + " · to do " + v.todo.length);
process.exit(first > 5000 ? 1 : 0);
