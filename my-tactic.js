/**
 * Bomberninja AI Tactic - Minimal & Explainable Grandmaster
 * 
 * 5 Clean Phases:
 * 1. Danger Mapping (Bombs, blast rays, and fire hazards)
 * 2. Bunker Retreat (Safely retreats to verified bunker after planting)
 * 3. Emergency Evasion (Dodges immediate fire or steps away from fuses)
 * 4. Tactical Bombing (Mines bricks or attacks opponent if escape exists)
 * 5. Goal Navigation via BFS (❤️ Lives > Powerups > Bricks > Opponent > Center)
 */

const BOARD_WIDTH = 20;
const TOTAL_CELLS = 400; // 20x20
const DIRECTIONS = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1]; // Up, Down, Left, Right

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

// Validates orthogonal adjacency and prevents horizontal row-wrapping
function isNeighbor(from, to) {
  if (to < 0 || to >= TOTAL_CELLS) return false;
  const diff = Math.abs(to - from);
  return diff === BOARD_WIDTH || (diff === 1 && Math.floor(from / BOARD_WIDTH) === Math.floor(to / BOARD_WIDTH));
}

// Returns adjacent cells that are not obstacles (Wall, Brick, Bomb)
function getWalkable(pos, board) {
  return DIRECTIONS
    .map((d) => pos + d)
    .filter((n) => isNeighbor(pos, n) && board[n] !== Cell.WALL && board[n] !== Cell.BRICK && board[n] !== Cell.BOMB);
}

// Computes 4-directional blast rays (stops at walls, absorbed by bricks)
function getBlastTiles(bombPos, power, board) {
  const blast = new Set([bombPos]);
  for (const dir of DIRECTIONS) {
    for (let p = 1; p <= power; p++) {
      const target = bombPos + dir * p;
      if (!isNeighbor(target - dir, target) || board[target] === Cell.WALL) break;
      blast.add(target);
      if (board[target] === Cell.BRICK) break; // Brick absorbs blast
    }
  }
  return blast;
}

// Distance to the center of the board
const distToCenter = (pos) =>
  Math.hypot(Math.floor(pos / BOARD_WIDTH) - 9.5, (pos % BOARD_WIDTH) - 9.5);

// Manhattan distance between two cells
const manhattan = (a, b) =>
  Math.abs(Math.floor(a / BOARD_WIDTH) - Math.floor(b / BOARD_WIDTH)) +
  Math.abs((a % BOARD_WIDTH) - (b % BOARD_WIDTH));

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

      // Clean up exploded bomb
      if (myActiveBomb !== null && board[myActiveBomb] !== Cell.BOMB) {
        myActiveBomb = null;
        retreatPlan = null;
      }

      const recordMove = (step) => {
        breadcrumbs.push(myPos);
        if (breadcrumbs.length > 25) breadcrumbs.shift();
        return step;
      };

      // =========================================================================
      // Phase 1: Danger Mapping
      // =========================================================================
      const activeBombs = [];
      const lethal = new Set();
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (board[i] === Cell.BOMB) activeBombs.push(i);
        else if (board[i] === Cell.EXPLOSION) lethal.add(i);
      }

      // Blast coverage of all ticking bombs (assuming reach >= 3 for safety)
      const allBlastCells = new Set();
      for (const b of activeBombs) {
        for (const c of getBlastTiles(b, 3, board)) allBlastCells.add(c);
      }

      const walkable = getWalkable(myPos, board);
      const safeMoves = walkable.filter((m) => !lethal.has(m) && !allBlastCells.has(m));

      // =========================================================================
      // Phase 2: Bomb Retreat Execution (Follow path to bunker)
      // =========================================================================
      if (retreatPlan !== null) {
        if (retreatPlan.path.length > 0) {
          const next = retreatPlan.path.shift();
          if (walkable.includes(next) && !lethal.has(next)) return recordMove(next);
        }

        const myBlast = getBlastTiles(retreatPlan.bombPos, 3, board);
        // Safe in bunker outside our bomb's blast
        if (!myBlast.has(myPos) && !lethal.has(myPos) && !allBlastCells.has(myPos)) {
          return Move.STAY; // Wait safely in bunker until detonation
        }
        retreatPlan = null; // Bunker threatened or escape blocked: trigger evasion
      }

      // =========================================================================
      // Phase 3: Emergency Evasion (Under imminent threat)
      // =========================================================================
      if (lethal.has(myPos) || (allBlastCells.has(myPos) && activeBombs.length > 0)) {
        if (safeMoves.length > 0) {
          safeMoves.sort((a, b) => distToCenter(a) - distToCenter(b));
          return recordMove(safeMoves[0]);
        }

        // When trapped in a corridor: always step AWAY from the nearest bomb
        const nonLethal = walkable.filter((m) => !lethal.has(m));
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

        // If on fire, any walkable step beats burning in place
        if (walkable.length > 0) {
          walkable.sort((a, b) => distToCenter(a) - distToCenter(b));
          return recordMove(walkable[0]);
        }
        return Move.STAY;
      }

      let closestOpp = null;
      for (const [id, pos] of Object.entries(state.players)) {
        if (id !== playerId && pos !== undefined) {
          if (closestOpp === null || manhattan(myPos, pos) < manhattan(myPos, closestOpp)) {
            closestOpp = pos;
          }
        }
      }

      // =========================================================================
      // Phase 4: Tactical Bomb Placement (Mines bricks or attacks opponent)
      // =========================================================================
      const touchesBrick = DIRECTIONS.some((d) => isNeighbor(myPos, myPos + d) && board[myPos + d] === Cell.BRICK);
      const hasMovesCloser = safeMoves.some((m) => distToCenter(m) < distToCenter(myPos));
      const canMine = touchesBrick && (turn < 90 || distToCenter(myPos) <= 4.5 || !hasMovesCloser);

      const blast = getBlastTiles(myPos, 1, board);
      const canAttack = closestOpp !== null && blast.has(closestOpp);
      const noBombClose = activeBombs.every((b) => manhattan(myPos, b) > 3);

      if ((canMine || canAttack) && board[myPos] === Cell.EMPTY && myActiveBomb === null && noBombClose) {

        // 1. Backtrack along breadcrumbs
        let retreatCandidate = [];
        for (let i = breadcrumbs.length - 1; i >= 0 && retreatCandidate.length < 4; i--) {
          const past = breadcrumbs[i];
          if (past !== myPos && !retreatCandidate.includes(past)) {
            retreatCandidate.push(past);
            if (!blast.has(past)) break;
          }
        }

        // 2. BFS bunker search up to depth 4
        if (retreatCandidate.length === 0 || blast.has(retreatCandidate[retreatCandidate.length - 1])) {
          const parent = new Int16Array(TOTAL_CELLS).fill(-1);
          const dist = new Uint8Array(TOTAL_CELLS);
          const queue = [myPos];
          let qHead = 0;
          let bunker = -1;

          while (qHead < queue.length) {
            const curr = queue[qHead++];
            if (dist[curr] > 4) break;

            if (!blast.has(curr) && !allBlastCells.has(curr) && !lethal.has(curr) && curr !== myPos) {
              bunker = curr;
              break;
            }

            for (const n of getWalkable(curr, board)) {
              if (n !== myPos && parent[n] === -1 && !allBlastCells.has(n) && !lethal.has(n)) {
                parent[n] = curr;
                dist[n] = dist[curr] + 1;
                queue.push(n);
              }
            }
          }

          if (bunker !== -1) {
            const path = [];
            let curr = bunker;
            while (curr !== myPos && curr !== -1) {
              path.unshift(curr);
              curr = parent[curr];
            }
            retreatCandidate = path;
          }
        }

        // Only plant if a complete verified bunker retreat route exists
        if (retreatCandidate.length > 0 && !blast.has(retreatCandidate[retreatCandidate.length - 1])) {
          myActiveBomb = myPos;
          retreatPlan = { bombPos: myPos, path: [...retreatCandidate] };
          return Move.PLACE_BOMB;
        }
      }

      // =========================================================================
      // Phase 5: Goal Navigation via BFS (❤️ Lives > Powerups > Bricks > Opponent > Center)
      // =========================================================================
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
        if (distNav[curr] > 20) break;

        const cell = board[curr];
        // 1. Extra Life (❤️)
        if (cell === Cell.POWERUP_LIVE && (turn < 95 || distToCenter(curr) <= 5.5)) {
          targetLife = curr;
          break; // Immediate priority
        }

        // 2. Powerups (Bomb/Power)
        if (targetPower === -1 && (cell === Cell.POWERUP_BOMB || cell === Cell.POWERUP_POWER)) {
          if (turn < 90 || distToCenter(curr) <= 4.5) targetPower = curr;
        }

        // 3. Bricks
        if (targetBrick === -1 && curr !== myPos) {
          const nearBrick = DIRECTIONS.some((d) => isNeighbor(curr, curr + d) && board[curr + d] === Cell.BRICK);
          if (nearBrick && (turn < 90 || distToCenter(curr) <= 4.5)) targetBrick = curr;
        }

        // 4. Opponent
        if (targetOpp === -1 && closestOpp !== null && curr === closestOpp && curr !== myPos) {
          if (turn < 90 || distToCenter(closestOpp) <= 4.5) targetOpp = curr;
        }

        for (const n of getWalkable(curr, board)) {
          if (n !== myPos && parentNav[n] === -1 && !allBlastCells.has(n) && !lethal.has(n)) {
            parentNav[n] = curr;
            distNav[n] = distNav[curr] + 1;
            qNav.push(n);
          }
        }
      }

      // Pick target by priority order
      const target = targetLife !== -1 ? targetLife : targetPower !== -1 ? targetPower : targetBrick !== -1 ? targetBrick : targetOpp;

      if (target !== -1) {
        let step = target;
        while (parentNav[step] !== myPos && parentNav[step] !== -1) {
          step = parentNav[step];
        }
        if (safeMoves.includes(step)) return recordMove(step);
      }

      // Default: Gravitate toward central safe citadel
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
