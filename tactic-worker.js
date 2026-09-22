import { parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";

let tacticFn = null;

async function initTactic() {
  const { tacticPath, initialState, playerId, matchIdx } = workerData;
  const resolvedPath = path.resolve(tacticPath);

  if (!fs.existsSync(resolvedPath)) {
    parentPort.postMessage({ type: "error", error: `Tactic not found: ${resolvedPath}` });
    return;
  }

  try {
    // Dynamic query string ensures fresh module & wasm instance per worker
    const mod = await import(`file://${resolvedPath}?m=${matchIdx}_${Date.now()}`);
    const init = mod.default;
    if (typeof init !== "function") {
      throw new Error("Tactic module default export must be a function");
    }
    tacticFn = init(initialState, playerId);
    parentPort.postMessage({ type: "ready" });
  } catch (err) {
    parentPort.postMessage({ type: "error", error: err.message });
  }
}

parentPort.on("message", (msg) => {
  if (msg.type === "turn") {
    if (!tacticFn) {
      parentPort.postMessage({ type: "error", error: "Tactic not initialized" });
      return;
    }
    try {
      const botInput = {
        board: new Uint8Array(msg.board),
        players: msg.players,
      };
      const move = tacticFn(botInput);
      parentPort.postMessage({ type: "move", move });
    } catch (err) {
      parentPort.postMessage({ type: "error", error: err.message });
    }
  }
});

initTactic();
