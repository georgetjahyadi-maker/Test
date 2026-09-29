// Headless campaign runner: plays the game with the Secretariat advisor in charge
// of every domain and prints a yearly summary. Used for balancing and testing.
import { createGame, advanceDays, type GameState } from '../src/sim/index';
import { offworldPopulation, earthPopulation, spaceGDP, earthGDP, settlementList, popOf } from '../src/sim/systems/helpers';
import { formatDate, yearOf } from '../src/sim/core/time';
import { fmtNum, fmtPower, fmtMoney } from '../src/sim/core/format';
import { interceptedFraction } from '../src/sim/systems/milestones';
import { MILESTONE } from '../src/sim/content/misc';

const args = process.argv.slice(2);
const years = Number(args.find((a) => a.startsWith('--years='))?.split('=')[1] ?? 50);
const seed = args.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 'helios';
const verbose = args.includes('--verbose');
const every = Number(args.find((a) => a.startsWith('--every='))?.split('=')[1] ?? 5);

const s: GameState = createGame(seed);
for (const k of Object.keys(s.une.delegation)) s.une.delegation[k] = true;
const t0 = Date.now();
let lastHist = 0;
for (let y = 0; y < years; y++) {
  advanceDays(s, 365);
  const yr = yearOf(s.day);
  if (verbose) {
    for (const h of s.history.slice(lastHist)) if (h.significance >= 3) console.log(`   ${formatDate(h.day)}  ${h.title}`);
    lastHist = s.history.length;
  }
  if ((y + 1) % every === 0 || s.gameOver) {
    const techs = Object.values(s.tech).filter((t) => t.known).length;
    const sts = settlementList(s);
    const biggest = sts.sort((a, b) => popOf(b) - popOf(a)).slice(0, 3).map((st) => `${st.name} ${fmtNum(popOf(st))}`).join(', ');
    console.log(`${yr} | off-world ${fmtNum(offworldPopulation(s))} in ${sts.length} | earth ${fmtNum(earthPopulation(s))} | GDP ${fmtMoney(earthGDP(s))} / space ${fmtMoney(spaceGDP(s))} | UNE ${fmtMoney(s.une.treasury)} debt ${fmtMoney(s.une.debt)} legit ${(s.une.metrics.legitimacy ?? 0).toFixed(2)} | RP ${fmtNum(s.research.rpLastYear)} techs ${techs} | launch ${fmtNum(s.earth.launchPrice)}/t cap ${fmtNum(s.earth.launchCapacity)} | swarm ${fmtNum(s.swarm.totalCollectors)} ${fmtPower(s.swarm.totalPowerW)} cap ${interceptedFraction(s).toExponential(2)} | ${biggest}`);
  }
  if (s.gameOver) {
    console.log('GAME OVER:', s.gameOver.title, '-', s.gameOver.reason);
    break;
  }
}
console.log('Milestones:');
for (const id of Object.keys(s.milestones).sort((a, b) => s.milestones[a] - s.milestones[b])) console.log(`  ${formatDate(s.milestones[id])}  ${MILESTONE[id]?.name}`);
console.log(`Laws: ${Object.keys(s.laws).join(', ')}`);
console.log(`Union: ${s.une.name} | constitution ${s.une.constitution} | factions: ${Object.values(s.factions).filter((f) => f.active).sort((a, b) => b.support - a.support).map((f) => `${f.short} ${(f.support * 100).toFixed(0)}%`).join(' ')}`);
console.log(`Runtime ${((Date.now() - t0) / 1000).toFixed(1)}s, history entries ${s.history.length}, save size ${(JSON.stringify(s).length / 1e6).toFixed(2)} MB`);
