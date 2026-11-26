# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mrjopi/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mrjopi/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks all 342 protocols the 14 November 2026 DefiLlama snapshot records with no token, by an implied value built only from each protocol's own figures — log-scaled TVL, seven-day growth, age with no token, chain breadth — with a concrete six-step farm plan per protocol, and a sortable, filterable dashboard with a detail view for each one. Protocols whose token already trades are kept apart in a live set, shown with the market's own value.

The model (radar-2): implied = 100 × TVL^0.7 × (1 + 0.35 × growth) × maturity × breadth × plausibility. Growth is the seven-day TVL change clamped to −50% … +300%; maturity runs 0.70 → 1.00 over 1,500 days since first listed (0.85 when the listing date is unknown); breadth adds 2% per extra chain up to five; plausibility is 0.05 for exchanges and for products that wrap, stake or bridge a token that already trades, 1.00 otherwise. A protocol here *records* no token; that is not proof it has none.

## Run it

```sh
node main.ts --input /input/snapshot.json
```

Locally, pass `--input <snapshot.json|directory>` and `MAKEFUN_OUTPUT_DIR=<dir>`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path/to/snapshot.json>
```

It writes `board.json` (342 rows), `data.js`, `dashboard/` and `screenshots/` to the output directory, and `dossier.json` last. Node 22 or later, standard library only; the run is deterministic — the same snapshot always writes the same bytes. Check the output against the gate with `node scripts/validate.mjs <output-dir> <snapshot.json>`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fmfbn67x&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
