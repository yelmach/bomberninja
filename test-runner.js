#!/usr/bin/env node

/**
 * Bomberninja Benchmark Runner (Tournament-Accurate Edition)
 * 
 * - Full Web Worker isolation per tactic instance
 * - True 250ms hard timeout enforcement via worker termination
 * - Zero visualization overhead for maximum speed
 * 
 * Usage:
 *   node test-runner.js --benchmark 50 --tactics my-tactic.js easy
 *   node test-runner.js my-tactic.js medium 50
 *   node test-runner.js (defaults to 50 games: my-tactic.js vs easy)
 */

import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import * as server from "./server/server.js";

// Load tactic configuration from file path or preset name ('easy', 'medium', 'hard')
export async function loadTactic(target) {
  let filePath;
  let name = target;

  if (target === "easy" || target === "medium" || target === "hard") {
    filePath = path.resolve(`./server/tactics/tactic-${target}.js`);
    name = `BOT_${target.toUpperCase()}`;
  } else {
    filePath = path.resolve(target);
    name = path.basename(target, path.extname(target));
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Tactic file not found: ${filePath}`);
  }

  return { name, path: filePath };
}

// Spawns an isolated Worker thread for the tactic
function spawnWorker(tacticPath, playerId, initialState, matchIdx) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve("./tactic-worker.js"), {
      workerData: { tacticPath, playerId, initialState, matchIdx },
    });
    const onError = (err) => reject(err);
    worker.once("error", onError);
    worker.once("message", (msg) => {
      worker.off("error", onError);
      if (msg.type === "ready") resolve(worker);
      else reject(new Error(msg.error || "Worker initialization failed"));
    });
  });
}

// Queries a worker for a move with hard timeout watchdog
function queryWorker(worker, board, players, maxTimeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    const start = performance.now();

    const onMessage = (msg) => {
      clearTimeout(timer);
      const elapsed = performance.now() - start;
      if (msg.type === "move") {
        resolve({ elapsed, move: msg.move, timedOut: false });
      } else {
        resolve({ elapsed, move: { type: 1, data: msg.error || "Worker error" }, error: msg.error });
      }
    };

    worker.once("message", onMessage);

    timer = setTimeout(() => {
      worker.off("message", onMessage);
      worker.terminate().catch(() => {});
      resolve({
        elapsed: maxTimeoutMs,
        move: { type: 1, data: `Timeout: exceeded ${maxTimeoutMs}ms limit` },
        timedOut: true,
      });
    }, maxTimeoutMs);

    worker.postMessage({ type: "turn", board: Array.from(board), players });
  });
}

/**
 * Runs a single headless match between tactics with worker isolation and 250ms timeout.
 */
export async function runMatch(tacticConfigs, matchIdx = 0, maxTimeoutMs = 250) {
  const playerIds = tacticConfigs.map((t, idx) => `P${idx + 1}_${t.name}`);
  const tacticMap = {};
  const stats = {};
  const activeWorkers = {};

  for (let i = 0; i < tacticConfigs.length; i++) {
    const id = playerIds[i];
    tacticMap[id] = tacticConfigs[i];
    stats[id] = { totalTimeMs: 0, turns: 0, maxTimeMs: 0, timeouts: 0, errors: [] };
  }

  const init = server.initial(playerIds);

  try {
    for (const id of playerIds) {
      activeWorkers[id] = await spawnWorker(tacticMap[id].path, id, init.state, matchIdx);
    }
  } catch (err) {
    for (const w of Object.values(activeWorkers)) {
      if (w) w.terminate().catch(() => {});
    }
    return {
      winner: null,
      error: `Init error: ${err.message}`,
      disqualified: [{ id: playerIds[0], reason: err.message }],
      stats,
    };
  }

  let turn = 0;
  let turnData = init.data;

  try {
    while (turn < server.MAX_TURNS) {
      const aliveIds = Object.keys(turnData.players);
      if (aliveIds.length <= 1) break;

      // Query all alive tactics concurrently in parallel
      const queryPromises = aliveIds.map(async (id) => {
        const worker = activeWorkers[id];
        if (!worker) {
          return [id, { type: 1, data: "Worker inactive" }];
        }
        const res = await queryWorker(worker, turnData.board, turnData.players, maxTimeoutMs);
        stats[id].totalTimeMs += res.elapsed;
        stats[id].turns++;
        if (res.elapsed > stats[id].maxTimeMs) stats[id].maxTimeMs = res.elapsed;

        if (res.timedOut) {
          stats[id].timeouts++;
          activeWorkers[id] = null;
        }
        if (res.error) {
          stats[id].errors.push({ turn, error: res.error });
        }
        return [id, res.move];
      });

      const moves = await Promise.all(queryPromises);
      const stepResult = server.applyMove(moves);
      turn++;

      if (stepResult.type === 3) {
        const results = stepResult.data;
        const winner = results.find((r) => r.status === 1);
        return {
          winner: winner ? winner.id : null,
          results,
          turns: turn,
          disqualified: stepResult.disqualified,
          stats,
        };
      }

      turnData = stepResult.data;
    }

    const results = Object.values(server.gameState.players).map((p) => ({
      id: p.id,
      score: p.isDead || server.MAX_TURNS * 2,
      status: p.isDead ? -1 : 1,
    }));
    const winner = results.find((r) => r.status === 1);

    return {
      winner: winner ? winner.id : null,
      results,
      turns: turn,
      disqualified: server.gameState.disqualified,
      stats,
    };
  } finally {
    for (const w of Object.values(activeWorkers)) {
      if (w) w.terminate().catch(() => {});
    }
  }
}

/**
 * Runs a benchmark batch of N matches.
 */
export async function runBenchmark(tacticConfigs, count = 50) {
  console.log(`=== RUNNING BENCHMARK (${count} matches) ===`);
  console.log(`Players: ${tacticConfigs.map((t) => t.name).join(" vs ")}\n`);

  const record = {};
  for (const t of tacticConfigs) {
    record[t.name] = { wins: 0, losses: 0, draws: 0, timeouts: 0, disqualifications: 0, totalTime: 0, turns: 0 };
  }

  const startBatch = performance.now();

  for (let i = 1; i <= count; i++) {
    // Alternate player order each game to eliminate spawn bias
    const order = i % 2 === 0 ? [...tacticConfigs].reverse() : [...tacticConfigs];
    const res = await runMatch(order, i);

    if (res.disqualified) {
      for (const d of res.disqualified) {
        const botName = tacticConfigs.find((t) => d.id.includes(t.name))?.name;
        if (botName) record[botName].disqualifications++;
      }
    }

    for (const [id, s] of Object.entries(res.stats)) {
      const botName = tacticConfigs.find((t) => id.includes(t.name))?.name;
      if (botName) {
        record[botName].totalTime += s.totalTimeMs;
        record[botName].turns += s.turns;
        record[botName].timeouts += s.timeouts;
      }
    }

    if (res.winner) {
      const winnerName = tacticConfigs.find((t) => res.winner.includes(t.name))?.name;
      for (const t of tacticConfigs) {
        if (t.name === winnerName) {
          record[t.name].wins++;
        } else {
          record[t.name].losses++;
        }
      }
    } else {
      for (const t of tacticConfigs) {
        record[t.name].draws++;
      }
    }

    console.log(
      `Progress: ${i}/${count} matches completed... (${tacticConfigs
        .map((t) => `${t.name}: ${record[t.name].wins}W`)
        .join(" | ")})`
    );
  }

  const elapsedBatch = ((performance.now() - startBatch) / 1000).toFixed(2);
  console.log(`\n\n=== BENCHMARK RESULTS (${elapsedBatch}s) ===`);

  for (const t of tacticConfigs) {
    const r = record[t.name];
    const winRate = ((r.wins / count) * 100).toFixed(1);
    const avgLatency = r.turns > 0 ? (r.totalTime / r.turns).toFixed(2) : "0.00";
    console.log(`\nBot: ${t.name}`);
    console.log(`  Wins:      ${r.wins} (${winRate}%)`);
    console.log(`  Losses:    ${r.losses}`);
    console.log(`  Draws:     ${r.draws}`);
    console.log(`  Timeouts:  ${r.timeouts}`);
    console.log(`  Disqual:   ${r.disqualifications}`);
    console.log(`  Avg Move:  ${avgLatency} ms/turn`);
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  let tactic1Name = "my-tactic.js";
  let tactic2Name = "easy";
  let count = 50;

  if (args.includes("--benchmark")) {
    const bIdx = args.indexOf("--benchmark");
    const parsedCount = parseInt(args[bIdx + 1], 10);
    if (!isNaN(parsedCount)) count = parsedCount;

    const tIdx = args.indexOf("--tactics");
    if (tIdx !== -1 && args[tIdx + 1] && args[tIdx + 2]) {
      tactic1Name = args[tIdx + 1];
      tactic2Name = args[tIdx + 2];
    }
  } else if (args.length >= 2) {
    tactic1Name = args[0];
    tactic2Name = args[1];
    if (args[2]) {
      const parsed = parseInt(args[2], 10);
      if (!isNaN(parsed)) count = parsed;
    }
  } else if (args.length === 1 && !args[0].startsWith("-")) {
    tactic2Name = args[0];
  }

  const t1 = await loadTactic(tactic1Name);
  const t2 = await loadTactic(tactic2Name);

  await runBenchmark([t1, t2], count);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error("Benchmark error:", err.message);
    process.exit(1);
  });
}
