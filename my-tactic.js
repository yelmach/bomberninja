/**
 * Bomberninja AI Tactic - High Performance Champion
 * 
 * 5-Phase Architecture:
 * Phase 1: Danger Mapping (Bombs, blast rays, and fire hazards)
 * Phase 2: Bomb Retreat Execution (Safely retreats to pre-calculated bunker)
 * Phase 3: Emergency Evasion (Dodges explosions and steps away from fuses)
 * Phase 4: Tactical Bomb Placement (Mines bricks & attacks with verified escape)
 * Phase 5: Goal Navigation via BFS (❤️ Lives > Powerups > Bricks > Opponent > Center)
 */

const BOARD_WIDTH = 20;
const TOTAL_CELLS = BOARD_WIDTH * BOARD_WIDTH; // 400

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

const Move = {
  PLACE_BOMB: -1,
  STAY: 0,
};

const DIRECTIONS = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1]; // Up, Down, Left, Right

// Validates orthogonal adjacency and prevents row-wrapping
function isNeighbor(from, to) {
  if (to < 0 || to >= TOTAL_CELLS) return false;
  const diff = Math.abs(to - from);
  if (diff === BOARD_WIDTH) return true;
  if (diff === 1) {
    return Math.floor(from / BOARD_WIDTH) === Math.floor(to / BOARD_WIDTH);
  }
  return false;
}

// Returns adjacent cells that are not obstacles (Wall, Brick, Bomb)
function getWalkableNeighbors(pos, board) {
  const neighbors = [];
  for (const dir of DIRECTIONS) {
    const next = pos + dir;
    if (isNeighbor(pos, next)) {
      const cell = board[next];
      if (cell !== Cell.WALL && cell !== Cell.BRICK && cell !== Cell.BOMB) {
        neighbors.push(next);
      }
    }
  }
  return neighbors;
}

// Checks if a straight-line blast ray can hit a target without wall obstruction
function canBombHit(from, to, power, board) {
  const fromRow = Math.floor(from / BOARD_WIDTH);
  const fromCol = from % BOARD_WIDTH;
  const toRow = Math.floor(to / BOARD_WIDTH);
  const toCol = to % BOARD_WIDTH;

  if (fromRow === toRow) {
    const dist = Math.abs(toCol - fromCol);
    if (dist > power) return false;
    const step = toCol > fromCol ? 1 : -1;
    for (let c = fromCol + step; c !== toCol; c += step) {
      if (board[fromRow * BOARD_WIDTH + c] === Cell.WALL) return false;
    }
    return true;
  }
  if (fromCol === toCol) {
    const dist = Math.abs(toRow - fromRow);
    if (dist > power) return false;
    const step = toRow > fromRow ? BOARD_WIDTH : -BOARD_WIDTH;
    for (let p = from + step; p !== to; p += step) {
      if (board[p] === Cell.WALL) return false;
    }
    return true;
  }
  return false;
}

// Computes blast tiles projected by a bomb in all 4 orthogonal directions
function getBlastTiles(bombPos, power, board) {
  const blast = new Set([bombPos]);
  for (const dir of DIRECTIONS) {
    for (let p = 1; p <= power; p++) {
      const target = bombPos + dir * p;
      if (!isNeighbor(target - dir, target)) break;
      if (target < 0 || target >= TOTAL_CELLS) break;
      if (board[target] === Cell.WALL) break;
      blast.add(target);
      if (board[target] === Cell.BRICK) break; // Brick absorbs blast
    }
  }
  return blast;
}

// Distance to the center of the board (rows 9-10, cols 9-10)
const distToCenter = (pos) => {
  const r = Math.floor(pos / BOARD_WIDTH);
  const c = pos % BOARD_WIDTH;
  return Math.hypot(r - 9.5, c - 9.5);
};

// Manhattan distance between two grid cells
const manhattan = (p1, p2) =>
  Math.abs(Math.floor(p1 / BOARD_WIDTH) - Math.floor(p2 / BOARD_WIDTH)) +
  Math.abs((p1 % BOARD_WIDTH) - (p2 % BOARD_WIDTH));

export default (_initialState, playerId) => {
  let turn = 0;
  const myPower = 1;
  const myMaxBombs = 1;

  // Active bombs placed by our bot
  const myActiveBombs = new Set();

  // History of safe positions visited recently (for fast backtracking)
  const breadcrumbs = [];

  // Active retreat tracker: { bombPos, turnsRemaining, retreatPath: [] }
  let activeRetreat = null;

  return (state) => {
    try {
      turn++;
      const myPos = state.players[playerId];
      const board = state.board;

      if (myPos === undefined) return Move.STAY;

      // Clean up our active bombs that have detonated
      for (const bPos of myActiveBombs) {
        if (board[bPos] !== Cell.BOMB) myActiveBombs.delete(bPos);
      }

      // Helper to record breadcrumbs history before returning a move
      const recordMove = (step) => {
        breadcrumbs.push(myPos);
        if (breadcrumbs.length > 25) breadcrumbs.shift();
        return step;
      };

      // =========================================================================
      // Phase 1: Danger Mapping (Bombs, blast rays, and fire hazards)
      // =========================================================================
      const activeBombs = [];
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (board[i] === Cell.BOMB) activeBombs.push(i);
      }

      // Active explosions and permanent fire belt hazards
      const lethalNow = new Set();
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (board[i] === Cell.EXPLOSION) lethalNow.add(i);
      }

      // Projected blast coverage of all ticking bombs (assuming reach >= 3)
      const allBlastCells = new Set();
      for (const bPos of activeBombs) {
        const blast = getBlastTiles(bPos, Math.max(3, myPower), board);
        for (const c of blast) allBlastCells.add(c);
      }

      const walkable = getWalkableNeighbors(myPos, board);
      const safeMoves = walkable.filter((m) => !lethalNow.has(m) && !allBlastCells.has(m));

      // Update retreat countdown
      if (activeRetreat !== null) {
        activeRetreat.turnsRemaining--;
        if (
          activeRetreat.turnsRemaining <= 0 ||
          (board[activeRetreat.bombPos] !== Cell.BOMB && board[activeRetreat.bombPos] !== Cell.EXPLOSION)
        ) {
          activeRetreat = null;
        }
      }

      // =========================================================================
      // Phase 2: Bomb Retreat Execution (Following pre-verified escape route)
      // =========================================================================
      if (activeRetreat !== null) {
        if (activeRetreat.retreatPath.length > 0) {
          const nextStep = activeRetreat.retreatPath.shift();
          if (walkable.includes(nextStep) && !lethalNow.has(nextStep)) {
            return recordMove(nextStep);
          }
        }

        const myBombBlast = getBlastTiles(activeRetreat.bombPos, Math.max(3, myPower), board);

        // Safely in bunker outside our bomb's blast
        if (!myBombBlast.has(myPos) && !lethalNow.has(myPos)) {
          if (allBlastCells.has(myPos)) {
            activeRetreat = null; // Opponent bomb blast touches bunker, trigger evasion
          } else {
            return Move.STAY; // Wait safely in bunker until detonation
          }
        } else {
          // Still in blast: step into safe tile outside our bomb
          const outOfBlast = safeMoves.filter((m) => !myBombBlast.has(m));
          if (outOfBlast.length > 0) {
            outOfBlast.sort((a, b) => distToCenter(a) - distToCenter(b));
            return recordMove(outOfBlast[0]);
          }

          const anyOutOfMine = walkable.filter((m) => !lethalNow.has(m) && !myBombBlast.has(m));
          if (anyOutOfMine.length > 0) {
            anyOutOfMine.sort((a, b) => distToCenter(a) - distToCenter(b));
            return recordMove(anyOutOfMine[0]);
          }

          const nonLethal = walkable.filter((m) => !lethalNow.has(m));
          if (nonLethal.length > 0) {
            nonLethal.sort((a, b) => Math.abs(b - activeRetreat.bombPos) - Math.abs(a - activeRetreat.bombPos));
            return recordMove(nonLethal[0]);
          }
          return Move.STAY;
        }
      }

      // =========================================================================
      // Phase 3: Emergency Evasion (Under imminent threat from fire or fuse)
      // =========================================================================
      if (lethalNow.has(myPos) || (allBlastCells.has(myPos) && activeBombs.length > 0)) {
        if (safeMoves.length > 0) {
          safeMoves.sort((a, b) => distToCenter(a) - distToCenter(b));
          return recordMove(safeMoves[0]);
        }

        // When trapped inside a corridor blast: always step AWAY from the nearest bomb
        const nonLethal = walkable.filter((m) => !lethalNow.has(m));
        if (nonLethal.length > 0 && activeBombs.length > 0) {
          const nearestBomb = activeBombs.reduce((best, b) =>
            manhattan(myPos, b) < manhattan(myPos, best) ? b : best, activeBombs[0]);
          nonLethal.sort((a, b) => manhattan(b, nearestBomb) - manhattan(a, nearestBomb));
          return recordMove(nonLethal[0]);
        }

        if (nonLethal.length > 0) {
          nonLethal.sort((a, b) => distToCenter(a) - distToCenter(b));
          return recordMove(nonLethal[0]);
        }

        // If standing on permanent fire, stepping to any walkable neighbor beats burning in place
        if (walkable.length > 0) {
          walkable.sort((a, b) => distToCenter(a) - distToCenter(b));
          return recordMove(walkable[0]);
        }
        return Move.STAY;
      }

      // Identify closest opponent
      const opponents = Object.entries(state.players)
        .filter(([id]) => id !== playerId)
        .map(([, pos]) => pos)
        .filter((pos) => pos !== undefined);

      const closestOpponent = opponents.length > 0 ? opponents.reduce((best, opp) =>
        manhattan(myPos, opp) < manhattan(myPos, best) ? opp : best, opponents[0]) : null;

      // =========================================================================
      // Phase 4: Tactical Bomb Placement (Mining bricks or attacking opponents)
      // =========================================================================
      const touchesBrick = DIRECTIONS.some((dir) => {
        const n = myPos + dir;
        return isNeighbor(myPos, n) && board[n] === Cell.BRICK;
      });

      // Anti-entrapment: allow mining if early game, if in center, or if blocked from moving inward
      const hasMovesCloserToCenter = safeMoves.some((m) => distToCenter(m) < distToCenter(myPos));
      const canDropForBrick = touchesBrick && (turn < 90 || distToCenter(myPos) <= 4.5 || !hasMovesCloserToCenter);
      const canDropForCombat = closestOpponent !== null && canBombHit(myPos, closestOpponent, myPower, board);
      const shouldDropBomb = canDropForBrick || canDropForCombat;

      // Proximity gating: only drop if no other bomb is within 3 tiles (prevents chain suicide)
      const noBombNearby = activeBombs.every((b) => manhattan(myPos, b) > 3);

      if (shouldDropBomb && board[myPos] === Cell.EMPTY && myActiveBombs.size < myMaxBombs && noBombNearby) {
        const blast = getBlastTiles(myPos, myPower, board);

        // 1. First attempt: backtrack along recent breadcrumbs
        let retreatCandidate = [];
        for (let i = breadcrumbs.length - 1; i >= 0 && retreatCandidate.length < 4; i--) {
          const pastPos = breadcrumbs[i];
          if (pastPos !== myPos && !retreatCandidate.includes(pastPos)) {
            retreatCandidate.push(pastPos);
            if (!blast.has(pastPos)) break;
          }
        }

        // 2. Second attempt: BFS bunker search up to depth 4
        if (retreatCandidate.length === 0 || blast.has(retreatCandidate[retreatCandidate.length - 1])) {
          const parent = new Int16Array(TOTAL_CELLS).fill(-1);
          const dist = new Uint8Array(TOTAL_CELLS);
          const q = [myPos];
          let head = 0;
          let safeBunker = -1;

          while (head < q.length) {
            const curr = q[head++];
            if (dist[curr] > 4) break;

            if (!blast.has(curr) && !allBlastCells.has(curr) && !lethalNow.has(curr) && curr !== myPos) {
              safeBunker = curr;
              break;
            }

            for (const n of getWalkableNeighbors(curr, board)) {
              if (n !== myPos && parent[n] === -1 && !allBlastCells.has(n) && !lethalNow.has(n)) {
                parent[n] = curr;
                dist[n] = dist[curr] + 1;
                q.push(n);
              }
            }
          }

          if (safeBunker !== -1) {
            const path = [];
            let curr = safeBunker;
            while (curr !== myPos && curr !== -1) {
              path.unshift(curr);
              curr = parent[curr];
            }
            retreatCandidate = path;
          }
        }

        // Only place bomb if a complete verified bunker retreat route exists
        if (retreatCandidate.length > 0 && !blast.has(retreatCandidate[retreatCandidate.length - 1])) {
          myActiveBombs.add(myPos);
          activeRetreat = {
            bombPos: myPos,
            turnsRemaining: 5,
            retreatPath: [...retreatCandidate],
          };
          return Move.PLACE_BOMB;
        }
      }

      // =========================================================================
      // Phase 5: Goal Navigation via BFS (❤️ Lives > Powerups > Bricks > Opponent > Center)
      // =========================================================================
      const parentNav = new Int16Array(TOTAL_CELLS).fill(-1);
      const distNav = new Uint8Array(TOTAL_CELLS);
      const qNav = [myPos];
      let headNav = 0;

      let lifeTarget = -1;
      let powerupTarget = -1;
      let brickTarget = -1;
      let opponentTarget = -1;

      while (headNav < qNav.length) {
        const curr = qNav[headNav++];
        if (distNav[curr] > 20) break;

        const cell = board[curr];
        // 1. Extra Life ❤️ is highest priority
        if (cell === Cell.POWERUP_LIVE) {
          if (turn < 95 || distToCenter(curr) <= 5.5) {
            lifeTarget = curr;
            break;
          }
        }

        // 2. Power-ups (Bombs, Power)
        if (powerupTarget === -1 && (cell === Cell.POWERUP_BOMB || cell === Cell.POWERUP_POWER)) {
          if (turn < 90 || distToCenter(curr) <= 4.5) {
            powerupTarget = curr;
          }
        }

        // 3. Destructible Bricks
        if (brickTarget === -1 && curr !== myPos) {
          const nearBrick = DIRECTIONS.some((d) => isNeighbor(curr, curr + d) && board[curr + d] === Cell.BRICK);
          if (nearBrick && (turn < 90 || distToCenter(curr) <= 4.5)) {
            brickTarget = curr;
          }
        }

        // 4. Opponent Position
        if (opponentTarget === -1 && closestOpponent !== null && curr === closestOpponent && curr !== myPos) {
          if (turn < 90 || distToCenter(closestOpponent) <= 4.5) {
            opponentTarget = curr;
          }
        }

        for (const n of getWalkableNeighbors(curr, board)) {
          if (n !== myPos && parentNav[n] === -1 && !allBlastCells.has(n) && !lethalNow.has(n)) {
            parentNav[n] = curr;
            distNav[n] = distNav[curr] + 1;
            qNav.push(n);
          }
        }
      }

      // Pick target in strict priority order
      const target =
        lifeTarget !== -1
          ? lifeTarget
          : powerupTarget !== -1
          ? powerupTarget
          : brickTarget !== -1
          ? brickTarget
          : opponentTarget;

      if (target !== -1) {
        let step = target;
        while (parentNav[step] !== myPos && parentNav[step] !== -1) {
          step = parentNav[step];
        }
        if (safeMoves.includes(step)) {
          return recordMove(step);
        }
      }

      // Default fallback: Move toward center citadel
      if (safeMoves.length > 0) {
        safeMoves.sort((a, b) => distToCenter(a) - distToCenter(b));
        return recordMove(safeMoves[0]);
      }

      return Move.STAY;
    } catch (_err) {
      return Move.STAY;
    }
  };
};
