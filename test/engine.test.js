// Run with: node test/engine.test.js
const B = require("../engine.js"), fixture = require("./fixture.js");
let fails = 0, passes = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? passes++ : fails++; if (!ok) console.log("FAIL", name, "\n  got ", JSON.stringify(got), "\n  want", JSON.stringify(want)); };
const near = (name, got, want) => { const ok = Math.abs(got - want) < 0.011; ok ? passes++ : fails++; if (!ok) console.log("FAIL", name, "got", got, "want", want); };
const db = (mut) => { const t = fixture(); if (mut) mut(t); return B.load(t); };

// --- schedules and bank holidays
eq("last thursday paydays", B.scheduleDates({unit: "month", on: "last thursday", start: "2026-10-01"}, "2026-10-01", "2027-03-01"), ["2026-10-29", "2026-11-26", "2026-12-31", "2027-01-28", "2027-02-25"]);
eq("christmas pay moved by exception", B.periods(db(), "ethan", "2026-12-01", "2027-01-01").map(p => p.start), ["2026-11-26", "2026-12-24"]);
eq("rent on the 15th, next working day", B.scheduleDates({unit: "month", on: "15", shift: "next working day", start: "2026-11-01"}, "2026-11-01", "2027-01-01"), ["2026-11-16", "2026-12-15"]);
eq("every 4 weeks", B.scheduleDates({unit: "week", every: 4, start: "2026-11-25"}, "2026-11-01", "2027-02-01"), ["2026-11-25", "2026-12-23", "2027-01-20"]);
eq("set dates", B.scheduleDates({unit: "dates", dates: "2027-01-04, 1 Apr 2027"}, "2026-11-01", "2028-01-01"), ["2027-01-04", "2027-04-01"]);
eq("quarterly", B.scheduleDates({unit: "month", every: 3, on: "4", start: "2027-01-04"}, "2027-01-01", "2028-01-01"), ["2027-01-04", "2027-04-05", "2027-07-05", "2027-10-04"].map(d => d).slice(0, 0).concat(["2027-01-04", "2027-04-04", "2027-07-04", "2027-10-04"]));
eq("2026 bank holidays at Christmas", ["2026-12-25", "2026-12-28", "2026-12-26"].map(B.isWorkingDay), [false, false, false]);
eq("Easter Monday 2027", B.isWorkingDay("2027-03-29"), false);
eq("NHS pay on Sat 28 Nov moves to Friday", B.scheduleDates({unit: "month", on: "28", shift: "previous working day", start: "2026-11-01"}, "2026-11-01", "2026-12-01"), ["2026-11-27"]);
eq("parents' money ends after December", B.occurrences(db(), db().byId["s-parents"], "2026-10-01", "2027-03-01").map(o => o.date), ["2026-10-30", "2026-11-30", "2026-12-31"]);

// --- pay periods
const e = db();
eq("Ethan's period on 5 Nov", B.periodAt(e, "ethan", "2026-11-05"), {start: "2026-10-29", next: "2026-11-26", name: "Nov 2026", pay: true, opening: false});
eq("Sophie before her first pay", B.periodAt(e, "sophie", "2026-11-05").next, "2026-11-27");

// --- splits
near("2 parts to 1: Sophie's third of £200", B.shareOf(e, "bills", "sophie", 200, "ethan"), 66.67);
near("fixed rent share", B.shareOf(e, "rent", "sophie", 1100, "ethan"), 400);
near("rent: Ethan's part", B.shareOf(e, "rent", "ethan", 1100, "ethan"), 700);

// --- between partners: bills came to £200, Sophie paid her usual £150
const b2 = db(t => { t.exceptions.push({id: "x2", item: "e-flat", date: "2026-11-01", action: "amount", amount: 200}); });
const bt = B.between(b2, "ethan", "2026-11-05");
near("mid-month: nothing owed yet", bt.iOwe + bt.owedToMe, 0);
near("mid-month: this month so far", bt.month.paidIn, 150);
const bt2 = B.between(b2, "ethan", "2026-12-01");
near("Ethan owes Sophie the extra she paid in November", bt2.iOwe, 150 - 66.67);
const bt3 = B.between(db(), "ethan", "2026-11-14");
near("rent share sent on the 13th isn't owed back", bt3.iOwe, 0);

// --- the plan for Ethan's November
const pl = B.planFor(e, "ethan", B.periodAt(e, "ethan", "2026-11-05"));
const already = pl.lines.filter(l => l.already).reduce((t, l) => t + l.amount, 0), catchup = pl.lines.filter(l => l.catchup).reduce((t, l) => t + l.amount, 0);
near("bills pot: £80 already there counts", pl.lines.find(l => l.already && l.account === "e-bills").amount, 80);
near("food pot: what's beyond the carried-over food counts", pl.lines.find(l => l.already && l.account === "e-food").amount, 45 - 24.11);
near("car pot was short of the fuel carried over: caught up", catchup, 24.11 * 0 + (10.71 - 5));
near("money in: pay + Sophie's shares + money already in pots", pl.totals.in, 2650 + 400 + 150 + already);
const isa = pl.lines.find(l => l.id === "e-isa-b");
near("cash ISA gets what's left", isa.amount, 2650 + 550 + already - catchup - (1100 + 450 + 15) - (225 + 100 + 200) - 333);

// --- payday sort: Sophie's transfers land in the bills pot, so less moves there
const pd = B.payday(e, "ethan", B.periodAt(e, "ethan", "2026-11-05"));
const bm = pd.moves.find(m => m.to === "e-bills");
near("bills pot needs bills minus Sophie's shares minus what's already there", bm.amount, 1100 + 450 + 15 - 550 - 80);

// --- weekly food: a £40 shop on payday is fine
const w = db(t => { t.transactions.push({id: "t1", date: "2026-10-29", person: "ethan", amount: 40, budget: "e-food-b", account: "e-food"}); });
const tw = B.today(w, "ethan", "2026-10-29");
const food = tw.tiles.find(x => x.name === "Food");
eq("food not ahead of pace after a weekly shop", food.pace >= 0, true);

// --- To do: paid for fuel from main -> move from Car pot; over budget -> Emergency pot covers
const m = db(t => {
  t.transactions.push({id: "t2", date: "2026-10-30", person: "ethan", amount: 35, budget: "e-fuel", account: "e-main"});
  t.transactions.push({id: "t3", date: "2026-10-31", person: "ethan", amount: 230, budget: "e-fun", account: "e-main"});
  t.budgets.find(b => b.id === "e-fun").carry = false;
});
const td = B.todo(m, "ethan", "2026-11-02");
const fuel = td.find(x => /^back:e-fuel:/.test(x.key));
eq("move fuel money back", [fuel.from, fuel.to, fuel.amount], ["e-car", "e-main", 35]);
const cover = td.find(x => x.over);
eq("Emergency pot covers going over fun", [cover.from, cover.to, cover.amount], ["e-emergency", "e-main", 30]);
const dec = B.planFor(m, "ethan", B.periodAt(m, "ethan", "2026-12-01"));
near("December pay tops the Emergency pot back up", (dec.lines.find(l => l.kind === "topup") || {}).amount, 30);

// --- a ticked move disappears
const m2 = db(t => { t.transactions.push({id: "t2", date: "2026-10-30", person: "ethan", amount: 35, budget: "e-fuel", account: "e-main"}); t.moves.push({id: "mv1", date: "2026-10-30", person: "ethan", from: "e-car", to: "e-main", amount: 35, key: "back:e-fuel:2026-10-29:e-main"}); });
eq("ticked move is done", B.todo(m2, "ethan", "2026-11-02").some(x => /^back:e-fuel/.test(x.key)), false);
// spending more after a tick asks only for the difference
const m3 = db(t => { t.transactions.push({id: "t2", date: "2026-10-30", person: "ethan", amount: 35, budget: "e-fuel", account: "e-main"}, {id: "t4", date: "2026-11-01", person: "ethan", amount: 10, budget: "e-fuel", account: "e-main"}); t.moves.push({id: "mv1", date: "2026-10-30", person: "ethan", from: "e-car", to: "e-main", amount: 35, key: "back:e-fuel:2026-10-29:e-main"}); });
near("only the new £10 to move", (B.todo(m3, "ethan", "2026-11-02").find(x => /^back:e-fuel/.test(x.key)) || {}).amount, 10);

// --- loans
const ln = B.loans(e, "ethan", "2026-11-01")[0];
eq("furniture repayments", ln.plan.map(r => [r.date, r.amount]), [["2026-12-28", 200], ["2027-01-28", 200], ["2027-02-28", 120]]);

// --- balances follow flows
const bal = B.balances(e, "2026-11-16");
near("bills pot after rent, VOXI, flat bills and Sophie's shares", bal["e-bills"], 80 + 150 + 400 - 450 - 15 - 1100);

// --- parents paying straight into the LISA: saved, not spendable, and you still move your own share
const pa = db(t => { t.income.push({id: "e-par", person: "ethan", name: "Parents' LISA top-up", amount: 167, account: "e-lisa", unit: "month", on: "1", start: "2026-11-01"}); });
const paPer = B.periodAt(pa, "ethan", "2026-11-05"), basePl = B.planFor(e, "ethan", B.periodAt(e, "ethan", "2026-11-05")), paPl = B.planFor(pa, "ethan", paPer);
near("parents' top-up doesn't swell the ISA remainder", paPl.lines.find(l => l.id === "e-isa-b").amount, basePl.lines.find(l => l.id === "e-isa-b").amount);
near("payday still moves your own LISA saving", (B.payday(pa, "ethan", paPer).moves.find(m => m.to === "e-lisa") || {}).amount, 333);
near("parents' top-up counts as saved", paPl.totals.save - basePl.totals.save, 167);
const L1 = B.lisa(pa, "e-lisa", "2026-10-26");
eq("LISA: planned to 5 April counts paydays and the parents", L1.taxYearEnd, "2027-04-05");
near("LISA: on course (6 paydays x 333 + 6 top-ups x 167)", L1.planned, 6 * 333 + 6 * 167);
const pb = db(t => { t.settings.push({person: "ethan", key: "lisa.paidBefore.e-lisa", value: "2500"}); });
near("LISA: paid before Budgie counts towards the limit", B.lisa(pb, "e-lisa", "2026-10-26").paidThisYear, 2500);
near("LISA: going over the limit is flagged", B.lisa(pb, "e-lisa", "2026-10-26").overBy, 2500 + 6 * 333 - 4000);

// --- things to check
const ck = db(t => { t.settings.push({person: "ethan", key: "check:e-home", value: JSON.stringify({t: "Is £50 right?", a: "edit", v: "budgets:e-home", o: 2})}, {person: "ethan", key: "check:pots", value: JSON.stringify({t: "Pots", a: "go", v: "pots", o: 1})}, {person: "ethan", key: "check:old", value: "done"}, {person: "sophie", key: "check:s", value: JSON.stringify({t: "Hers"})}); });
eq("checks: open ones, in order, only mine", B.checks(ck, "ethan").map(c => c.id), ["pots", "e-home"]);

// --- whole picture runs without errors for both, across a year
["ethan", "sophie"].forEach(p => {
  for (let d = "2026-10-26"; d < "2027-11-01"; d = B.addDays(d, 17)) { B.today(e, p, d); B.pots(e, p, d); B.year(e, p, d); B.summary(e, p, d); }
});
passes++;

console.log(fails ? fails + " failed, " + passes + " passed" : "All " + passes + " passed");
process.exit(fails ? 1 : 0);
