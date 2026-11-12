// node 04-webinator/selfcheck.js : simulated games from 04-webinator/bank.json
const fs = require("fs"), path = require("path");
const Game = require("./game.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "bank.json"), "utf8"));
const keys = Object.keys(data.questions);
const bank = {};
Object.entries(data.companies).forEach(([n, c]) => { if (c.status === "ok") bank[n] = c.p; });
const r = Game.selfCheck(bank, keys, ["Monzo", "Nvidia", "Lego"]);
console.log(JSON.stringify(r, null, 1));
// a clear first answer must visibly grey candidates out, without zeroing anyone
const g0 = Game.newGame(bank, keys), g1 = Game.applyAnswer(g0, bank, keys, bank.Monzo[g0.question] >= 0.5 ? "yes" : "no");
const greyed = Object.keys(bank).length - Game.liveNames(g1).length;
const noZero = Object.values(g1.weights).every((w) => w > 0);
console.log("first answer greyed", greyed, "no zero weights", noZero);
if (!(greyed > 0 && noZero)) process.exit(1);
process.exit(r.ok ? 0 : 1);
