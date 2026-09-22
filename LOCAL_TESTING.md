# Bomberninja: Local Testing & Benchmark Guide

This repository contains the **official game engine, opponent bots, and headless benchmark runner** for the Bomberninja tournament on the 01-Edu platform.

All visualization and replay files have been removed to keep the setup minimal, fast, and simple.

---

## 📁 Repository Structure

```
bomberninja/
├── GAME_INSTRUCTION.md      # Original tournament briefing
├── GAME_RULES.md            # Complete game engine rules & disqualification specs
├── LOCAL_TESTING.md         # This benchmark guide
├── package.json             # ES module config & benchmark npm scripts
├── test-runner.js           # Fast headless benchmark runner
├── my-tactic.js             # High-performance rule-compliant AI tactic
└── server/
    ├── server.js            # Official Bomberninja server engine
    ├── tactics/             # Official WebAssembly opponent bots
    │   ├── tactic-easy.js   # Official Easy bot
    │   ├── tactic-medium.js # Official Medium bot
    │   └── tactic-hard.js   # Official Hard bot
    └── workers/             # Official tournament worker scripts
```

---

## 🚀 Running Benchmarks

### 1. Default Benchmark
Runs 50 matches of `my-tactic.js` against the Easy bot:
```bash
node test-runner.js
```

### 2. Custom Benchmark Command
Specify match count and any opponent tier (`easy`, `medium`, `hard`):

```bash
# Benchmark against Easy bot
node test-runner.js --benchmark 50 --tactics my-tactic.js easy

# Benchmark against Medium bot
node test-runner.js --benchmark 50 --tactics my-tactic.js medium

# Benchmark against Hard bot
node test-runner.js --benchmark 50 --tactics my-tactic.js hard
```

### 3. Shorthand Syntax
```bash
node test-runner.js my-tactic.js easy 20
node test-runner.js my-tactic.js medium 50
```

### 4. NPM Scripts
```bash
npm run benchmark:easy
npm run benchmark:medium
npm run benchmark:hard
```

---

## 📊 Benchmark Metrics Explained

When the benchmark finishes, it outputs:

- **Wins / Losses / Draws**: Overall win rate percentage.
- **Disqual**: Total invalid move disqualifications (must always be **0**!).
- **Timeouts**: Moves exceeding the strict **250ms** tournament limit (must always be **0**!).
- **Avg Move**: Average execution time per turn (typically **0.01 - 0.05ms**).
- **Execution Speed**: Typically completes 50 full 350-turn matches in under **0.2 seconds**.

---

## ✍️ Writing & Testing New Tactics

Create a new JavaScript file (e.g. `tactic-v2.js`):

```javascript
/**
 * @param {Object} initialState - Full server state provided once at start
 * @param {string} playerId     - Your unique bot ID
 * @returns {Function}          - Turn callback function (state) => move
 */
export default (_initialState, playerId) => {
  return (state) => {
    const myPos = state.players[playerId];
    const board = state.board;

    if (myPos === undefined) return 0;

    // Return: -1 (bomb), 0 (stay), or adjacent orthogonal cell index
    return 0;
  };
};
```

Benchmark your new tactic immediately against your previous version or official bots:
```bash
node test-runner.js --benchmark 50 --tactics tactic-v2.js easy
node test-runner.js --benchmark 50 --tactics tactic-v2.js my-tactic.js
```
