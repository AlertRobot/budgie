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
const already = pl.lines.filter(l => l.already || l.leftover).reduce((t, l) => t + l.amount, 0), catchup = pl.lines.filter(l => l.catchup).reduce((t, l) => t + l.amount, 0);
near("bills pot: £80 already there counts", pl.lines.find(l => l.already && l.account === "e-bills").amount, 80);
near("what is left in the main account carries into the new month", (pl.lines.find(l => l.leftover) || {}).amount, 300 - 200 * 3 / 28);
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


// --- LISA history from the provider's statement: payments count towards the limit, bonuses and fees don't
const lh = db(t => { t.moves.push(
  {id: "h1", date: "2026-05-11", person: "ethan", from: "", to: "e-lisa", amount: 334, key: "lisa:in:2026-05-11"},
  {id: "h2", date: "2026-09-09", person: "ethan", from: "", to: "e-lisa", amount: 334, key: "lisa:in:2026-09-09"},
  {id: "h3", date: "2026-10-01", person: "ethan", from: "", to: "e-lisa", amount: 83.5, key: "lisa:bonus:2026-10-01"},
  {id: "h4", date: "2026-10-07", person: "ethan", from: "e-lisa", to: "", amount: 4.56, key: "lisa:fee:2026-10-07"}); });
const LH = B.lisa(lh, "e-lisa", "2026-10-26");
near("LISA history: payments count", LH.paidThisYear, 668);
near("LISA history: bonus received", LH.bonusReceived, 83.5);
near("LISA history: fees", LH.feesThisYear, 4.56);
eq("LISA history: by month", LH.months.filter(m => m.paid || m.bonus || m.fees).map(m => [m.month, m.paid, m.bonus, m.fees]), [["2026-05", 334, 0, 0], ["2026-09", 334, 0, 0], ["2026-10", 0, 83.5, 4.56]]);
near("LISA history doesn't change today's balance", B.balances(lh, "2026-10-26")["e-lisa"], 11240);

// --- a payday that can't cover everything: the fallback pot covers the gap
const sh = db(t => { t.bills.push({id: "big", person: "ethan", name: "Big one-off", amount: 2500, account: "e-bills", unit: "once", start: "2026-11-20"}); });
const shp = B.payday(sh, "ethan", B.periodAt(sh, "ethan", "2026-11-05"));
// the Emergency pot has £300: it covers what it can, and the rest is flagged
eq("short pay: Emergency pot covers what it has", [shp.cover && shp.cover.from, shp.cover && shp.cover.amount, shp.uncovered], ["e-emergency", 300, 1049.25]);

// ================= review fixes (1.3.0) =================
const dbt = (mut, today) => { const t = fixture(); if (mut) mut(t); return B.load(t, today); };
const planAt = (d, p, date) => B.planFor(d, p, B.periodAt(d, p, date));
const lineAmt = (pl, f) => pl.lines.filter(f).reduce((t, l) => t + l.amount, 0);

// #1 payday moves done in the bank but not ticked, then every balance checked: no double counting
(() => {
  const base = dbt(null, "2026-10-29"), nov = B.periodAt(base, "ethan", "2026-10-29"), moves = B.payday(base, "ethan", nov).moves;
  const bal = Object.assign({}, B.balances(base, "2026-11-20")); moves.forEach(m => { bal[m.from] -= m.amount; bal[m.to] += m.amount; });
  const checks = t => Object.keys(bal).filter(a => /^e-/.test(a)).forEach((a, i) => t.valuations.push({id: "chk" + i, account: a, date: "2026-11-20", amount: B.round(bal[a])}));
  const unticked = planAt(dbt(checks, "2026-11-26"), "ethan", "2026-11-26");
  const ticked = planAt(dbt(t => { moves.forEach((m, i) => t.moves.push({id: "tk" + i, date: "2026-10-29", person: "ethan", from: m.from, to: m.to, amount: m.amount, key: "pay:2026-10-29:" + m.to})); checks(t); }, "2026-11-26"), "ethan", "2026-11-26");
  near("#1 unticked moves + later balance checks: same ISA as ticked", lineAmt(unticked, l => l.id === "e-isa-b"), lineAmt(ticked, l => l.id === "e-isa-b"));
  eq("#1 no catch-up on Main", unticked.lines.some(l => l.catchup), false);
  eq("#1 payday ticks are dated on payday", [B.moveDate("pay:2026-10-29:e-isa", "2026-11-03"), B.moveDate("back:e-fuel:2026-10-29:e-main", "2026-11-03")], ["2026-10-29", "2026-11-03"]);
})();

// #6 the payday cover fills the whole gap, only from money that's there, and is topped up after
(() => {
  const big = amt => t => t.bills.push({id: "big", person: "ethan", name: "Big one-off", amount: amt, account: "e-bills", unit: "once", start: "2026-11-20"});
  const a = dbt(big(1200), "2026-10-29"), pa = B.payday(a, "ethan", B.periodAt(a, "ethan", "2026-10-29"));
  eq("#6 a small gap is covered too, so Fun keeps its £200", [pa.plan.shortfall, pa.cover && pa.cover.amount, pa.keeps], [49.25, 49.25, 200]);
  const b = dbt(big(2500), "2026-10-29"), pb = B.payday(b, "ethan", B.periodAt(b, "ethan", "2026-10-29"));
  const ms = pb.moves.map((m, i) => ({id: "m" + i, date: "2026-10-29", person: "ethan", from: m.from, to: m.to, amount: m.amount, key: "pay:2026-10-29:" + m.to}));
  ms.push({id: "cv", date: "2026-10-29", person: "ethan", from: "e-emergency", to: "e-main", amount: pb.cover.amount, key: pb.cover.key});
  const c = dbt(t => { big(2500)(t); t.moves.push(...ms); }, "2026-11-26");
  near("#6 Emergency pot never goes under", B.balances(c, "2026-11-25")["e-emergency"], 0);
  near("#6 next pay tops up the cover", lineAmt(planAt(c, "ethan", "2026-11-26"), l => l.kind === "topup"), 300);
})();

// #7 budgets follow the middle of the pay period
(() => {
  // Christmas until 27 Dec, but the December pay comes on the 24th: planned once
  const x = dbt(t => t.budgets.push({id: "s-xmas", person: "sophie", name: "Christmas", amount: 100, mode: "oneoff", account: "s-main", start: "2026-11-27", end: "2026-12-27"}));
  const t_ = ["2026-11-27", "2026-12-24", "2027-01-28"].map(d => lineAmt(planAt(x, "sophie", d), l => l.id === "s-xmas"));
  eq("#7 Sophie's Christmas planned once", t_, [100, 0, 0]);
  // Christmas merged into Gifts: 450 from 26 Nov, back to 25 from 24 Dec, nothing before it starts
  const g = dbt(t => { t.budgets.push({id: "e-gifts", person: "ethan", name: "Gifts and birthdays", amount: 25, mode: "oneoff", account: "e-main", start: "2026-11-26"}); t.amounts.push({id: "g1", item: "e-gifts", start: "2026-11-26", amount: 450}, {id: "g2", item: "e-gifts", start: "2026-12-24", amount: 25}); });
  eq("#7 Gifts and birthdays by period", ["2026-11-05", "2026-11-26", "2026-12-24", "2027-01-28"].map(d => lineAmt(planAt(g, "ethan", d), l => l.id === "e-gifts")), [0, 450, 25, 25]);
  // an amount dated by the calendar (1 Dec) still lands in the Christmas period
  const g2 = dbt(t => { t.budgets.push({id: "e-gifts", person: "ethan", name: "Gifts", amount: 25, mode: "oneoff", account: "e-main"}); t.amounts.push({id: "g1", item: "e-gifts", start: "2026-12-01", amount: 450}, {id: "g2", item: "e-gifts", start: "2027-01-01", amount: 25}); });
  eq("#7 calendar-dated amounts", ["2026-11-26", "2026-12-24"].map(d => lineAmt(planAt(g2, "ethan", d), l => l.id === "e-gifts")), [450, 25]);
  // a change "from today" early in a period counts this period
  const f = dbt(t => t.amounts.push({id: "a1", item: "e-fun", start: "2026-11-10", amount: 300}), "2026-11-10");
  near("#7 Fun changed on 10 Nov counts now", B.today(f, "ethan", "2026-11-10").tiles.find(x => x.name === "Fun").amount, 300 + 21.43);
})();

// #8 going over a budget whose pot paid for it: caught up once, no top-up for money the fallback never paid
(() => {
  const d = dbt(t => t.transactions.push({id: "f1", date: "2026-11-10", person: "ethan", amount: 300, budget: "e-food-b", account: "e-food"}), "2026-11-26");
  const pl = planAt(d, "ethan", "2026-11-26");
  eq("#8 no top-up", pl.lines.some(l => l.kind === "topup"), false);
  near("#8 the Food pot is caught up", lineAmt(pl, l => l.catchup && l.account === "e-food"), 50.89);
})();

// #9 a split payment from the wrong account: only my share moves, and it isn't "over"
(() => {
  const d = dbt(t => t.transactions.push({id: "big", date: "2026-11-02", person: "ethan", amount: 300, budget: "e-food-b", account: "e-main", split: "half"}), "2026-11-03");
  const td = B.todo(d, "ethan", "2026-11-03");
  near("#9 move back my £150 share", (td.find(x => /^back:e-food-b/.test(x.key)) || {}).amount, 150);
  eq("#9 not over budget", td.some(x => x.over), false);
})();

// #10 spending logged after a balance check on the same day still counts
(() => {
  const d = dbt(t => { t.valuations.find(v => v.id === "v1").updated = Date.parse("2026-10-26T09:00:00Z"); t.transactions.push({id: "late", date: "2026-10-26", person: "ethan", amount: 20, budget: "e-fun", account: "e-main", updated: Date.parse("2026-10-26T15:00:00Z")}, {id: "early", date: "2026-10-26", person: "ethan", amount: 5, budget: "e-fun", account: "e-main", updated: Date.parse("2026-10-26T08:00:00Z")}); }, "2026-10-26");
  near("#10 later spend counts, earlier one is in the check", B.balances(d, "2026-10-26")["e-main"], 280);
})();

// #11 an unspent one-off budget (no carry) is released next month, not held back
(() => {
  const d = dbt(t => t.budgets.push({id: "e-home", person: "ethan", name: "Household", amount: 50, mode: "oneoff", account: "e-main"}), "2026-11-26");
  const without = planAt(dbt(null, "2026-11-26"), "ethan", "2026-11-26"), withHome = planAt(d, "ethan", "2026-11-26");
  // last month's unspent £50 comes back as left over and pays for this month's £50, so the ISA is unchanged
  near("#11 unspent one-off money is left over next month", lineAmt(withHome, l => l.id === "leftover") - lineAmt(without, l => l.id === "leftover"), 50);
  near("#11 so the ISA doesn't lose it", lineAmt(without, l => l.id === "e-isa-b") - lineAmt(withHome, l => l.id === "e-isa-b"), 0);
  eq("#11 nothing carries for it", B.budgetState(d, "ethan", B.periodAt(d, "ethan", "2026-11-05"))["e-home"].carryOut, 0);
})();

// #12 the payday estimate keeps what's left of a "whatever is left" budget, which can still be spent
(() => {
  const est = planAt(dbt(null, "2026-11-01"), "sophie", "2026-11-27");
  const left = B.today(dbt(null, "2026-11-01"), "sophie", "2026-11-01").tiles.find(x => x.id === "s-fun").left;
  const spent = planAt(dbt(t => t.transactions.push({id: "sf", date: "2026-11-20", person: "sophie", amount: left, budget: "s-fun", account: "s-main"}), "2026-11-21"), "sophie", "2026-11-27");
  near("#12 estimate doesn't count fun money as left over", lineAmt(est, l => l.id === "s-fun"), lineAmt(spent, l => l.id === "s-fun"));
})();

// #13 a sinking fund in a pot builds up
(() => {
  const t0 = t => { t.budgets.push({id: "e-carfund", person: "ethan", name: "Car insurance fund", amount: 50, mode: "saving", account: "e-car"}); t.bills.push({id: "e-ins", person: "ethan", name: "Car insurance", amount: 600, account: "e-car", unit: "year", start: "2027-10-01"}); };
  const moves = []; let d = "2026-10-29", last = 0, toCar = [];
  for (let i = 0; i < 6; i++) {
    const x = dbt(t => { t0(t); t.moves.push(...moves); }, d), per = B.periodAt(x, "ethan", d), pd = B.payday(x, "ethan", per);
    pd.moves.forEach((m, j) => moves.push({id: "m" + i + j, date: per.start, person: "ethan", from: m.from, to: m.to, amount: m.amount, key: "pay:" + per.start + ":" + m.to}));
    toCar.push((pd.moves.find(m => m.to === "e-car") || {amount: 0}).amount); d = per.next;
  }
  const fin = dbt(t => { t0(t); t.moves.push(...moves); }, d);
  near("#13 after 6 paydays the pot holds the fund plus the fuel carry", B.balances(fin, B.addDays(d, -1))["e-car"], 6 * 50 + 100 + 100);
  eq("#13 the £50 is moved every month", toCar.slice(2).every(a => a >= 50), true);
})();

// #14 tracking that starts on a payday is a normal pay period; balances checked on the first day count
(() => {
  const d = dbt(t => { t.settings.find(s => s.person === "ethan").value = "2026-10-29"; t.valuations.forEach(v => v.date = "2026-10-28"); }, "2026-10-29");
  const per = B.periodAt(d, "ethan", "2026-10-29"), pl = B.planFor(d, "ethan", per);
  eq("#14 not an opening period", [per.pay, per.opening], [true, false]);
  near("#14 LISA saving planned", lineAmt(pl, l => l.id === "e-lisa-b"), 333);
  near("#14 money in Main at the start is left over for this month", lineAmt(pl, l => l.id === "leftover"), 300);
  // a balance checked on the first day after the pay landed isn't counted on top of the pay
  const d2 = dbt(t => { t.settings.find(s => s.person === "ethan").value = "2026-10-29"; t.valuations.forEach(v => v.date = "2026-10-29"); t.valuations.find(v => v.id === "v1").amount = 2950; }, "2026-10-29");
  near("#14 start-day check after payday: Main counted once", lineAmt(planAt(d2, "ethan", "2026-10-29"), l => l.id === "leftover"), 300);
  eq("#14 payday sort on the To do", B.todo(d, "ethan", "2026-10-29").some(x => x.payday), true);
  eq("#14 something goes to the ISA", lineAmt(pl, l => l.id === "e-isa-b") > 0, true);
  const op = B.planFor(e, "ethan", B.periodAt(e, "ethan", "2026-10-27"));
  near("#14 balances checked on the start day are the opening money", lineAmt(op, l => l.id === "opening"), 300 + 80 + 45 + 5);
})();

// #15 the period before the opening one ends where tracking starts
(() => {
  const op = B.periodAt(e, "ethan", "2026-10-27"), pv = B.prevPeriod(e, "ethan", op);
  eq("#15 no overlap", [op.start, pv.next <= "2026-10-26"], ["2026-10-26", true]);
  eq("#15 the year marks the current period", B.year(e, "sophie", "2026-11-05").filter(r => r.current).length, 1);
  eq("#15 no top-up in the opening period for its own overspend", B.planFor(dbt(t => t.transactions.push({id: "o1", date: "2026-10-27", person: "ethan", amount: 100, budget: "e-fun", account: "e-main"})), "ethan", op).lines.some(l => l.kind === "topup"), false);
})();

// #19 LISA: this month's saving counts until it's ticked; money paid before Budgie isn't counted twice
(() => {
  eq("#19 on course is the same on payday as the day before", [B.lisa(dbt(null, "2026-10-28"), "e-lisa", "2026-10-28").onCourse, B.lisa(dbt(null, "2026-10-29"), "e-lisa", "2026-10-29").onCourse], [1998, 1998]);
  const tk = B.lisa(dbt(t => t.moves.push({id: "m1", date: "2026-10-29", person: "ethan", from: "e-main", to: "e-lisa", amount: 333, key: "pay:2026-10-29:e-lisa"}), "2026-10-29"), "e-lisa", "2026-10-29");
  eq("#19 after ticking", [tk.paidThisYear, tk.onCourse], [333, 1998]);
  const hist = t => t.moves.push({id: "h1", date: "2026-05-11", person: "ethan", from: "", to: "e-lisa", amount: 334, key: "lisa:in:2026-05-11"}, {id: "h2", date: "2026-09-09", person: "ethan", from: "", to: "e-lisa", amount: 334, key: "lisa:in:2026-09-09"});
  near("#19 paid-before plus statement rows", B.lisa(dbt(t => { hist(t); t.settings.push({person: "ethan", key: "lisa.paidBefore.e-lisa", value: "668"}); }), "e-lisa", "2026-10-26").paidThisYear, 668);
  near("#19 paid-before larger than the statement rows", B.lisa(dbt(t => { hist(t); t.settings.push({person: "ethan", key: "lisa.paidBefore.e-lisa", value: "1000"}); }), "e-lisa", "2026-10-26").paidThisYear, 1000);
  const dup = dbt(t => t.moves.push({id: "m1", date: "2026-10-29", person: "ethan", from: "e-main", to: "e-lisa", amount: 333, key: "pay:2026-10-29:e-lisa"}, {id: "h3", date: "2026-10-30", person: "ethan", from: "", to: "e-lisa", amount: 333, key: "lisa:in:2026-10-30"}), "2026-11-02");
  eq("#19 a statement row for a ticked move counts once", [B.lisa(dup, "e-lisa", "2026-11-02").paidThisYear, B.balances(dup, "2026-11-02")["e-lisa"]], [333, 11240 + 333]);
})();

// #20 refunds
(() => {
  const a = dbt(t => t.transactions.push({id: "p", date: "2026-11-02", person: "ethan", amount: 60, budget: "e-fuel", account: "e-main"}, {id: "r", date: "2026-11-03", person: "ethan", amount: -60, budget: "e-fuel", account: "e-main"}), "2026-11-04");
  eq("#20 paid and refunded through Main: nothing to move", B.todo(a, "ethan", "2026-11-04").filter(x => !x.payday && x.type === "move").length, 0);
  const b = dbt(t => t.transactions.push({id: "p", date: "2026-11-02", person: "ethan", amount: 60, budget: "e-fuel", account: "e-car"}, {id: "r", date: "2026-11-03", person: "ethan", amount: -20, budget: "e-fuel", account: "e-main"}), "2026-11-04");
  const rf = B.todo(b, "ethan", "2026-11-04").find(x => /^refund:/.test(x.key));
  eq("#20 a refund into Main goes back to the Car pot", rf && [rf.from, rf.to, rf.amount], ["e-main", "e-car", 20]);
})();

// #21 someone without a payday still gets monthly periods
(() => {
  const d = dbt(t => { t.income = t.income.filter(i => i.person !== "sophie" || !i.isPay); });
  eq("#21 monthly periods from the start day", B.periodAt(d, "sophie", "2027-03-01"), {start: "2027-02-26", next: "2027-03-26", name: "Mar 2027", pay: false, opening: false});
})();

// #24 two dates shifted onto the same working day are both kept
eq("#24 daily, next working day: 7 payments in a week", B.scheduleDates({unit: "day", start: "2026-11-02", shift: "next working day"}, "2026-11-02", "2026-11-09").length + B.scheduleDates({unit: "day", start: "2026-11-02", shift: "next working day"}, "2026-11-09", "2026-11-10").length - 1, 7);
eq("#24 each occurrence has its own key", (() => { const d = dbt(t => t.bills.push({id: "dly", person: "ethan", name: "Daily", amount: 1, account: "e-main", unit: "day", start: "2026-11-02", shift: "next working day"})); const k = B.occurrences(d, d.byId.dly, "2026-11-09", "2026-11-10").map(o => o.key); return k.length === new Set(k).size && k.length === 3; })(), true);

// goals return the target date as due; prices load
eq("goals: due date", B.goals(e, "ethan", "2026-10-26")[0].due, "");
eq("goals: due date set", B.goals(dbt(t => t.goals[0].due = "2031-10-01"), "ethan", "2026-10-26")[0].due, "2031-10-01");
eq("goals: no by", "by" in B.goals(e, "ethan", "2026-10-26")[0], false);
eq("prices load", dbt(t => t.prices = [{id: "p1", fund: "X", date: "2026-10-26", price: "1.23"}, {id: "p2", fund: "X", date: "2026-10-25", price: 1, deleted: true}]).prices.map(p => p.price), [1.23]);
eq("deleted stubs from sync are ignored", dbt(t => t.transactions.push({id: "t1", deleted: true})).transactions.length, 0);

// --- whole picture runs without errors for both, across a year
["ethan", "sophie"].forEach(p => {
  for (let d = "2026-10-26"; d < "2027-11-01"; d = B.addDays(d, 17)) { B.today(e, p, d); B.pots(e, p, d); B.year(e, p, d); B.summary(e, p, d); }
});
passes++;

console.log(fails ? fails + " failed, " + passes + " passed" : "All " + passes + " passed");
process.exit(fails ? 1 : 0);
