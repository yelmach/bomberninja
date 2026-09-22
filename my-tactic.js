// Board Dimensions & Constants
const BOARD_WIDTH = 20;
const TOTAL_CELLS = 400; // 20x20 grid
const DIRECTIONS = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1]; // Up, Down, Left, Right

// Cell Types
const Cell = {
  EMPTY: 0,
  BRICK: 1,
  WALL: 2,
  BOMB: 4,
  EXPLOSION: 5,
  POWERUP_LIVE: 6,
  POWERUP_BOMB: 7,
  POWERUP_POWER: 8,
};

// Move Commands
const Move = {
  PLACE_BOMB: -1,
  STAY: 0,
};

function isNeighbor(from, to) {
  if (to < 0 || to >= TOTAL_CELLS) return false;
  const diff = Math.abs(to - from);
  return diff === BOARD_WIDTH || (diff === 1 && Math.floor(from / BOARD_WIDTH) === Math.floor(to / BOARD_WIDTH));
}

function getWalkable(pos, board) {
  return DIRECTIONS
    .map((dir) => pos + dir)
    .filter((next) => isNeighbor(pos, next) && board[next] !== Cell.WALL && board[next] !== Cell.BRICK && board[next] !== Cell.BOMB);
}

function getBlastTiles(bombPos, power, board) {
  const blast = new Set([bombPos]);
  for (const dir of DIRECTIONS) {
    for (let p = 1; p <= power; p++) {
      const target = bombPos + dir * p;
      // Stop if ray leaves board or hits an impassable wall
      if (!isNeighbor(target - dir, target) || board[target] === Cell.WALL) break;
      blast.add(target);
      // Bricks absorb the blast and prevent rays from continuing further
      if (board[target] === Cell.BRICK) break;
    }
  }
  return blast;
}

const distToCenter = (pos) =>
  Math.hypot(Math.floor(pos / BOARD_WIDTH) - 9.5, (pos % BOARD_WIDTH) - 9.5);

const manhattan = (a, b) =>
  Math.abs(Math.floor(a / BOARD_WIDTH) - Math.floor(b / BOARD_WIDTH)) +
  Math.abs((a % BOARD_WIDTH) - (b % BOARD_WIDTH));

function reconstructFirstStep(target, start, parent) {
  let step = target;
  while (parent[step] !== start && parent[step] !== -1) {
    step = parent[step];
  }
  return step;
}

function reconstructFullPath(target, start, parent) {
  const path = [];
  let curr = target;
  while (curr !== start && curr !== -1) {
    path.unshift(curr);
    curr = parent[curr];
  }
  return path;
}

function buildDangerMap(myPos, board) {
  const activeBombs = [];
  const lethal = new Set();

  // Single pass over 400 cells to classify hazards
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (board[i] === Cell.BOMB) {
      activeBombs.push(i);
    } else if (board[i] === Cell.EXPLOSION) {
      lethal.add(i); // Active explosion or permanent fire belt border
    }
  }

  // Project blast coverage for every ticking bomb
  const allBlast = new Set();
  for (const b of activeBombs) {
    for (const c of getBlastTiles(b, 3, board)) {
      allBlast.add(c);
    }
  }

  // Filter walkable moves that are completely free of all lethal hazards
  const walkable = getWalkable(myPos, board);
  const safeMoves = walkable.filter((m) => !lethal.has(m) && !allBlast.has(m));

  return { activeBombs, lethal, allBlast, walkable, safeMoves };
}

function executeRetreat(retreatPlan, myPos, board, danger) {
  // Step 1: Follow remaining steps along pre-computed escape path
  if (retreatPlan.path.length > 0) {
    const next = retreatPlan.path.shift();
    if (danger.walkable.includes(next) && !danger.lethal.has(next)) {
      return next;
    }
  }

  // Step 2: Check if our bot is resting safely in the bunker outside our bomb's blast
  const myBlast = getBlastTiles(retreatPlan.bombPos, 3, board);
  const inSafety = !myBlast.has(myPos) && !danger.lethal.has(myPos);

  if (inSafety) {
    // If no opponent blast threatens the bunker, safely wait for detonation
    if (!danger.allBlast.has(myPos)) {
      return Move.STAY;
    }
  }

  // Bunker is compromised or path blocked: return null to trigger Emergency Evasion
  return null;
}

function findEvasionMove(myPos, danger) {
  // Option 1: Step to the safe move closest to the center citadel
  if (danger.safeMoves.length > 0) {
    danger.safeMoves.sort((a, b) => distToCenter(a) - distToCenter(b));
    return danger.safeMoves[0];
  }

  const nonLethal = danger.walkable.filter((m) => !danger.lethal.has(m));

  // Option 2: Trapped in a blast corridor - step furthest AWAY from nearest bomb
  if (nonLethal.length > 0 && danger.activeBombs.length > 0) {
    const nearestBomb = danger.activeBombs.reduce((closest, b) =>
      manhattan(myPos, b) < manhattan(myPos, closest) ? b : closest, danger.activeBombs[0]);
    nonLethal.sort((a, b) => manhattan(b, nearestBomb) - manhattan(a, nearestBomb));
    return nonLethal[0];
  }

  // Option 3: Step to any non-fire tile closest to center
  if (nonLethal.length > 0) {
    nonLethal.sort((a, b) => distToCenter(a) - distToCenter(b));
    return nonLethal[0];
  }

  // Option 4: On permanent fire belt - any walkable move beats burning in place
  if (danger.walkable.length > 0) {
    danger.walkable.sort((a, b) => distToCenter(a) - distToCenter(b));
    return danger.walkable[0];
  }

  return Move.STAY;
}


function getClosestOpponent(myPos, players, myId) {
  let closestOpp = null;
  for (const [id, pos] of Object.entries(players)) {
    if (id !== myId && pos !== undefined) {
      if (closestOpp === null || manhattan(myPos, pos) < manhattan(myPos, closestOpp)) {
        closestOpp = pos;
      }
    }
  }
  return closestOpp;
}

function findBunkerPath(myPos, board, blast, danger, breadcrumbs) {
  // Method A: Fast backtrack along recently visited safe breadcrumbs
  let candidate = [];
  for (let i = breadcrumbs.length - 1; i >= 0 && candidate.length < 4; i--) {
    const past = breadcrumbs[i];
    if (past !== myPos && !candidate.includes(past)) {
      candidate.push(past);
      if (!blast.has(past)) break; // Found a tile outside our new bomb's blast
    }
  }

  // Method B: If breadcrumbs don't exit blast, run a short 4-step BFS bunker search
  if (candidate.length === 0 || blast.has(candidate[candidate.length - 1])) {
    const parent = new Int16Array(TOTAL_CELLS).fill(-1);
    const dist = new Uint8Array(TOTAL_CELLS);
    const queue = [myPos];
    let qHead = 0;
    let bunker = -1;

    while (qHead < queue.length) {
      const curr = queue[qHead++];
      if (dist[curr] > 4) break;

      // Safe bunker condition: outside our blast, outside enemy blasts, and not on fire
      if (!blast.has(curr) && !danger.allBlast.has(curr) && !danger.lethal.has(curr) && curr !== myPos) {
        bunker = curr;
        break;
      }

      for (const n of getWalkable(curr, board)) {
        if (n !== myPos && parent[n] === -1 && !danger.allBlast.has(n) && !danger.lethal.has(n)) {
          parent[n] = curr;
          dist[n] = dist[curr] + 1;
          queue.push(n);
        }
      }
    }

    if (bunker !== -1) {
      candidate = reconstructFullPath(bunker, myPos, parent);
    }
  }

  // Ensure candidate route exists and successfully terminates outside the blast
  if (candidate.length > 0 && !blast.has(candidate[candidate.length - 1])) {
    return candidate;
  }
  return null; // No verified retreat route exists: dropping a bomb would be suicide
}

function tryPlantBomb(myPos, board, closestOpp, danger, breadcrumbs, myActiveBomb, turn) {
  // Gating conditions: current tile must be empty, no bomb currently out, and no nearby ticking bomb
  const canPlantTile = board[myPos] === Cell.EMPTY && myActiveBomb === null;
  const noBombClose = danger.activeBombs.every((b) => manhattan(myPos, b) > 3);
  if (!canPlantTile || !noBombClose) return null;

  // Tactical Triggers:
  // 1. Brick mining (gated in late-game to avoid getting trapped by shrinking borders)
  const touchesBrick = DIRECTIONS.some((d) => isNeighbor(myPos, myPos + d) && board[myPos + d] === Cell.BRICK);
  const hasMovesCloser = danger.safeMoves.some((m) => distToCenter(m) < distToCenter(myPos));
  const canMine = touchesBrick && (turn < 90 || distToCenter(myPos) <= 4.5 || !hasMovesCloser);

  // 2. Direct combat strike on adjacent opponent in blast cross
  const blast = getBlastTiles(myPos, 1, board);
  const canAttack = closestOpp !== null && blast.has(closestOpp);

  if (canMine || canAttack) {
    // Only place bomb if a verified bunker escape path exists!
    const retreatRoute = findBunkerPath(myPos, board, blast, danger, breadcrumbs);
    if (retreatRoute !== null) {
      return { bombPos: myPos, path: retreatRoute };
    }
  }

  return null;
}


function findGoalMove(myPos, board, closestOpp, danger, turn) {
  const parentNav = new Int16Array(TOTAL_CELLS).fill(-1);
  const distNav = new Uint8Array(TOTAL_CELLS);
  const qNav = [myPos];
  let qHeadNav = 0;

  let targetLife = -1;
  let targetPower = -1;
  let targetBrick = -1;
  let targetOpp = -1;

  while (qHeadNav < qNav.length) {
    const curr = qNav[qHeadNav++];
    if (distNav[curr] > 20) break; // Limit search radius to 20 tiles

    const cell = board[curr];

    // Priority 1: Extra Life (❤️)
    if (cell === Cell.POWERUP_LIVE && (turn < 95 || distToCenter(curr) <= 5.5)) {
      targetLife = curr;
      break; // Immediate priority: stop search immediately
    }

    // Priority 2: Bomb & Power upgrades
    if (targetPower === -1 && (cell === Cell.POWERUP_BOMB || cell === Cell.POWERUP_POWER)) {
      if (turn < 90 || distToCenter(curr) <= 4.5) targetPower = curr;
    }

    // Priority 3: Destructible Bricks for mining
    if (targetBrick === -1 && curr !== myPos) {
      const nearBrick = DIRECTIONS.some((d) => isNeighbor(curr, curr + d) && board[curr + d] === Cell.BRICK);
      if (nearBrick && (turn < 90 || distToCenter(curr) <= 4.5)) targetBrick = curr;
    }

    // Priority 4: Opponent location for tactical closing
    if (targetOpp === -1 && closestOpp !== null && curr === closestOpp && curr !== myPos) {
      if (turn < 90 || distToCenter(closestOpp) <= 4.5) targetOpp = curr;
    }

    // Expand search into walkable, hazard-free cells
    for (const n of getWalkable(curr, board)) {
      if (n !== myPos && parentNav[n] === -1 && !danger.allBlast.has(n) && !danger.lethal.has(n)) {
        parentNav[n] = curr;
        distNav[n] = distNav[curr] + 1;
        qNav.push(n);
      }
    }
  }

  // Select target by strict priority order
  const target = targetLife !== -1 ? targetLife : targetPower !== -1 ? targetPower : targetBrick !== -1 ? targetBrick : targetOpp;

  if (target !== -1) {
    const firstStep = reconstructFirstStep(target, myPos, parentNav);
    if (danger.safeMoves.includes(firstStep)) {
      return firstStep;
    }
  }

  // Default fallback: Gravitate toward central safe citadel
  if (danger.safeMoves.length > 0) {
    danger.safeMoves.sort((a, b) => distToCenter(a) - distToCenter(b));
    return danger.safeMoves[0];
  }

  return Move.STAY;
}


export default (_initialState, playerId) => {
  let turn = 0;
  let myActiveBomb = null;
  const breadcrumbs = [];
  let retreatPlan = null; // { bombPos, path: [] }

  return (state) => {
    try {
      turn++;
      const myPos = state.players[playerId];
      const board = state.board;
      if (myPos === undefined) return Move.STAY;

      // Clean up tracked bomb after detonation
      if (myActiveBomb !== null && board[myActiveBomb] !== Cell.BOMB) {
        myActiveBomb = null;
        retreatPlan = null;
      }

      // Helper to maintain recent movement history for fast backtracking
      const recordMove = (step) => {
        if (step > 0 && step !== myPos) {
          breadcrumbs.push(myPos);
          if (breadcrumbs.length > 25) breadcrumbs.shift();
        }
        return step;
      };

      // Phase 1: Threat Analysis (buildDangerMap)
      const danger = buildDangerMap(myPos, board);

      // Phase 2: Bunker Retreat Execution (executeRetreat)
      if (retreatPlan !== null) {
        const retreatMove = executeRetreat(retreatPlan, myPos, board, danger);
        if (retreatMove !== null) {
          return recordMove(retreatMove);
        }
        retreatPlan = null; // Retreat compromised or finished: yield to evasion
      }

      // Phase 3: Emergency Evasion (findEvasionMove)
      if (danger.lethal.has(myPos) || (danger.allBlast.has(myPos) && danger.activeBombs.length > 0)) {
        return recordMove(findEvasionMove(myPos, danger));
      }

      // Identify closest opponent
      const closestOpp = getClosestOpponent(myPos, state.players, playerId);

      // Phase 4: Tactical Bomb Placement (tryPlantBomb)
      const plan = tryPlantBomb(myPos, board, closestOpp, danger, breadcrumbs, myActiveBomb, turn);
      if (plan !== null) {
        myActiveBomb = myPos;
        retreatPlan = plan;
        return Move.PLACE_BOMB;
      }

      // Phase 5: Goal Navigation via BFS (findGoalMove)
      return recordMove(findGoalMove(myPos, board, closestOpp, danger, turn));
    } catch (_err) {
      return Move.STAY; // Graceful fallback on unexpected error
    }
  };
};
