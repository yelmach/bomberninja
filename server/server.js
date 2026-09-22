/**
 * Bomberninja Game Server Engine
 * Extracted and formatted from official 01-Edu Tournament platform (tournament.01edu.ai).
 * 
 * Game constants, rule verification, turn resolution, fire-belt mechanics, and scoring.
 */

// Cell types
export const Cell = {
  EMPTY: 0,
  BRICK: 1,
  WALL: 2,
  FREE: 3,
  BOMB: 4,
  EXPLOSION: 5,
  POWERUP_LIVE: 6,
  POWERUP_BOMB: 7,
  POWERUP_POWER: 8,
};

export const CellName = {
  0: "EMPTY",
  1: "BRICK",
  2: "WALL",
  3: "FREE",
  4: "BOMB",
  5: "EXPLOSION",
  6: "POWERUP_LIVE",
  7: "POWERUP_BOMB",
  8: "POWERUP_POWER",
};

export const Move = {
  PLACE_BOMB: -1,
  STAY: 0,
};

export const POWERUPS = [Cell.POWERUP_LIVE, Cell.POWERUP_BOMB, Cell.POWERUP_POWER];

export const BOARD_WIDTH = 20;
export const TOTAL_CELLS = BOARD_WIDTH * BOARD_WIDTH; // 400
export const FIRE_START_TURN = 100; // Fire belt begins advancing at turn 100 (index 99)
export const FIRE_INTERVAL = 3;    // Advances every 3 turns
export const INNER_WIDTH = BOARD_WIDTH - 2; // 18
export const MAX_TURNS = 350;
export const BOMB_FUSE = 4; // Turns before explosion

export const OBSTACLES = new Set([Cell.WALL, Cell.BOMB, Cell.BRICK]); // [2, 4, 1]

// Four orthogonal directions: Up (-20), Down (+20), Left (-1), Right (+1)
export const DIRECTIONS = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1];

// Spawn positions for players (indices on 20x20 grid)
// 21 = (1, 1), 378 = (18, 18), 361 = (18, 1), 38 = (1, 18)
export const SPAWN_POSITIONS = [21, 378, 361, 38];

/**
 * Checks if a destination move is valid.
 * An adjacent tile is valid if:
 * 1. Absolute difference is 1 (horizontal) or 20 (vertical).
 * 2. Destination is not a Wall (2), Brick (1), or Bomb (4).
 *    (Exception: if another player placed a bomb at target during this turn)
 */
export const isMoveValid = (targetPos, board, currentPos, lastBombPlacedPos) => {
  const diff = Math.abs(targetPos - currentPos);
  if (!(diff === 1 || diff === BOARD_WIDTH)) return false;
  // Guard against horizontal wrapping: (e.g. from index 19 to 20)
  if (diff === 1 && Math.floor(targetPos / BOARD_WIDTH) !== Math.floor(currentPos / BOARD_WIDTH)) {
    return false;
  }
  if (targetPos < 0 || targetPos >= TOTAL_CELLS) return false;
  const cell = board[targetPos];
  return (cell === Cell.BOMB && lastBombPlacedPos && lastBombPlacedPos === targetPos) || !OBSTACLES.has(cell);
};

/**
 * Computes bomb blast affected cells:
 * - Extends in 4 directions up to `power` cells.
 * - Stops and destroys bricks (added to blast).
 * - Stops at walls (not added to blast).
 */
export const getBombBlast = (bombPos, power, board) => {
  const blast = [bombPos];
  for (const dir of DIRECTIONS) {
    for (let p = 1; p <= power; p++) {
      const target = bombPos + dir * p;
      if (target < 0 || target >= TOTAL_CELLS) break;
      // Guard horizontal blast wrapping
      if (Math.abs(dir) === 1 && Math.floor(target / BOARD_WIDTH) !== Math.floor(bombPos / BOARD_WIDTH)) {
        break;
      }
      if (board[target] === Cell.WALL) {
        break; // Wall stops blast
      }
      blast.push(target);
      if (board[target] === Cell.BRICK) {
        break; // Brick stops blast
      }
    }
  }
  return blast;
};

/**
 * Computes fire belt inward spiral coordinates.
 */
export const getFireBeltLevelAndPos = (step) => {
  const e = INNER_WIDTH + 1; // 19
  const i = e ** 2 - 4 * step;
  const level = Math.floor((e - Math.sqrt(i)) / 2);
  const pos = step - level * (e - level);
  return { level, position: pos };
};

export const getFireBeltCell = (level, side, pos) => {
  const offset = level + 1;
  const startCorners = [
    offset * BOARD_WIDTH + offset,                                        // Top-Left
    offset * BOARD_WIDTH + (BOARD_WIDTH - 1 - offset),                    // Top-Right
    (BOARD_WIDTH - 1 - offset) * BOARD_WIDTH + (BOARD_WIDTH - 1 - offset), // Bottom-Right
    (BOARD_WIDTH - 1 - offset) * BOARD_WIDTH + offset                     // Bottom-Left
  ];
  const deltas = [1, BOARD_WIDTH, -1, -BOARD_WIDTH];
  return startCorners[side] + deltas[side] * pos;
};

// Initial Board Template
// 🪨 = 2 = WALL, 🟢 = 3 = FREE (Spawn buffer), ⚫ = 0 = EMPTY
const EMOJI_MAP = { "\u{1FAA8}": 2, "\u{1F7E2}": 3, "\u26AB": 0 };
const parseBoardTemplate = (raw) =>
  new Uint8Array(
    raw
      .trim()
      .split("\n")
      .flatMap((line) => [...line])
      .map((ch) => EMOJI_MAP[ch])
  );

const BOARD_TEMPLATE = parseBoardTemplate(`
\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1F7E2}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1F7E2}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u26AB\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u26AB\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1FAA8}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u26AB\u26AB\u26AB\u{1FAA8}\u{1FAA8}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u{1F7E2}\u{1F7E2}\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u26AB\u{1F7E2}\u{1F7E2}\u{1FAA8}
\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}\u{1FAA8}
`);

/**
 * Generates a procedural board with bricks and hidden powerups.
 */
export const generateBoard = () => {
  const board = new Uint8Array(BOARD_TEMPLATE);
  const emptyIndices = [];
  const powerUpCells = {};
  const maxPowerups = 32;

  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) emptyIndices.push(i);
    if (board[i] === 3) board[i] = 0; // Clear free spawn area to empty
  }

  // Place 130 bricks randomly
  for (let n = 0; n < 130 && emptyIndices.length > 0; n++) {
    const randIdx = Math.floor(Math.random() * emptyIndices.length);
    const cellPos = emptyIndices[randIdx];
    // 26% chance of a powerup hidden inside this brick (up to 32 total)
    if (Math.random() < 0.26 && Object.keys(powerUpCells).length < maxPowerups) {
      const powerupType = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      powerUpCells[cellPos] = powerupType;
    }
    board[cellPos] = Cell.BRICK;
    emptyIndices.splice(randIdx, 1);
  }

  return { board, powerUpCells };
};

// Internal engine state
let gameState;
let currentTurn = 0;
let playerOrder = [];
let disqualifiedList;
const fireBeltSet = new Set();

/**
 * Resets the game state.
 */
export const reset = () => {
  const { board, powerUpCells } = generateBoard();
  currentTurn = 0;
  disqualifiedList = undefined;
  fireBeltSet.clear();
  gameState = {
    board,
    powerUpCells,
    players: Object.fromEntries(
      playerOrder.map((id, idx) => [
        id,
        {
          id,
          position: SPAWN_POSITIONS[idx],
          live: 1,
          power: 1,
          bombs: 1,
          isDead: 0,
        },
      ])
    ),
    bombs: [],
  };
};

/**
 * Returns player-visible game data for the current turn.
 * Players object maps only alive players to their integer position.
 */
export const getVisibleData = () => {
  const players = {};
  for (const id of playerOrder) {
    const player = gameState.players[id];
    if (!player.isDead) {
      players[id] = player.position;
    }
  }
  return { board: gameState.board, players };
};

/**
 * Advance fire belt hazard at turn t.
 */
const advanceFireBelt = (turn, board) => {
  const o = turn + 1 - FIRE_START_TURN;
  if (o < 0 || o % FIRE_INTERVAL !== 0) return;

  const step = Math.floor(o / FIRE_INTERVAL);
  const { level, position } = getFireBeltLevelAndPos(step);

  if (position < INNER_WIDTH - level * 2) {
    for (let side = 0; side < 4; side++) {
      const cell = getFireBeltCell(level, side, position);
      if (board[cell] !== Cell.WALL) {
        fireBeltSet.add(cell);
        board[cell] = Cell.EXPLOSION;
        for (const id of playerOrder) {
          const player = gameState.players[id];
          if (!player.isDead && player.position === cell) {
            if (--player.live <= 0) {
              player.isDead = currentTurn;
            }
          }
        }
      }
    }
  }
};

/**
 * Turn update phase: clears old explosions, advances fire belt, updates bombs.
 */
const updateBoardPhase = (turn) => {
  const { board, players } = gameState;

  // Clear bomb explosions from previous turn (unless in permanent fire belt)
  for (let i = 0; i < board.length; i++) {
    if (board[i] === Cell.EXPLOSION && !fireBeltSet.has(i)) {
      board[i] = Cell.EMPTY;
    }
  }

  // Advance fire belt
  advanceFireBelt(turn, board);

  // Update bomb fuses and trigger explosions
  for (let i = gameState.bombs.length - 1; i >= 0; i--) {
    const bomb = gameState.bombs[i];
    bomb.countdown--;
    if (bomb.countdown > 0) continue;

    // Bomb explodes!
    gameState.bombs.splice(i, 1);
    const blastCells = getBombBlast(bomb.position, bomb.power, board);

    for (const cell of blastCells) {
      // Chain reaction: if another bomb is in blast, reduce its countdown to 1
      const chainIdx = gameState.bombs.findIndex((b) => b.position === cell && b.countdown !== 0);
      if (chainIdx !== -1) {
        gameState.bombs[chainIdx].countdown = 1;
      }

      // Damage players caught in blast
      for (const id of playerOrder) {
        const player = players[id];
        if (player.position === cell && !player.isDead) {
          if (--player.live <= 0) {
            player.isDead = currentTurn;
          }
        }
      }

      // Destroy brick or reveal hidden powerup
      if (board[cell] === Cell.BRICK) {
        const powerup = gameState.powerUpCells[cell];
        board[cell] = powerup ? powerup : Cell.EMPTY;
        continue;
      }

      // Mark cell as explosion (walls are not converted to explosions)
      if (board[cell] !== Cell.WALL) {
        board[cell] = Cell.EXPLOSION;
      }
    }
  }
};

/**
 * Places a bomb on the board for a player.
 */
const placeBomb = (state, player) => {
  if (state.board[player.position] !== Cell.EMPTY) return false;
  let activeBombs = 0;
  for (const b of state.bombs) {
    if (b.owner === player.id) activeBombs++;
  }
  if (activeBombs >= player.bombs) return false;

  state.board[player.position] = Cell.BOMB;
  state.bombs.push({
    position: player.position,
    power: player.power,
    countdown: BOMB_FUSE,
    owner: player.id,
  });
  return true;
};

/**
 * Disqualifies a player due to an error or invalid move.
 */
const recordDisqualification = (errorObj, playerId) => {
  gameState.players[playerId].isDead = currentTurn;
  const entry = {
    id: playerId,
    reason: errorObj.data,
    line: errorObj.line,
    column: errorObj.column,
  };
  if (!disqualifiedList) {
    disqualifiedList = [entry];
  } else {
    disqualifiedList.push(entry);
  }
};

const isErrorObject = (val) => val !== null && typeof val === "object" && val.type === 1;

/**
 * Initializes a new game for the given player IDs.
 */
export const initial = (playerIds) => {
  // Randomize player positions/corners
  const rand = playerIds.map(Math.random);
  playerOrder = playerIds.toSorted((a, b) => rand[playerIds.indexOf(a)] - rand[playerIds.indexOf(b)]);
  reset();
  return {
    data: getVisibleData(),
    state: gameState,
    minPlayers: 2,
    maxTurns: MAX_TURNS,
    nextTurn: playerIds,
  };
};

/**
 * Applies a batch of moves for the current turn.
 * @param {Array<[string, number|Object]>} moves - Array of [playerId, move] pairs.
 */
export const applyMove = (moves) => {
  updateBoardPhase(currentTurn);

  let lastBombPlacedPos;

  for (const [playerId, move] of moves) {
    const player = gameState.players[playerId];
    if (player.isDead) continue;

    // Bot returned an unhandled error object
    if (isErrorObject(move)) {
      recordDisqualification(move, playerId);
      continue;
    }

    // Player standing in fire belt takes damage
    if (fireBeltSet.has(player.position)) {
      if (!player.isDead && --player.live <= 0) {
        player.isDead = currentTurn;
      }
      continue;
    }

    // STAY move (0 or current position)
    if (move === Move.STAY || player.position === move) {
      continue;
    }

    // PLACE_BOMB move (-1)
    if (move === Move.PLACE_BOMB) {
      placeBomb(gameState, player);
      lastBombPlacedPos = player.position;
      continue;
    }

    // Check if move is legal
    if (!isMoveValid(move, gameState.board, player.position, lastBombPlacedPos)) {
      recordDisqualification({ data: `move: ${move} is invalid ` }, playerId);
      continue;
    }

    // Apply move
    player.position = move;
    const cellValue = gameState.board[player.position];
    const cellTypeName = CellName[cellValue];

    if (!cellTypeName) {
      throw Error(`unexpected cell type ${cellValue}`);
    }

    // Stepped into an active explosion
    if (cellValue === Cell.EXPLOSION) {
      if (!player.isDead && --player.live <= 0) {
        player.isDead = currentTurn;
      }
      continue;
    }

    // Stepped onto a power-up
    if (cellTypeName.startsWith("POWERUP_")) {
      if (cellValue === Cell.POWERUP_LIVE) player.live++;
      else if (cellValue === Cell.POWERUP_POWER) player.power++;
      else if (cellValue === Cell.POWERUP_BOMB) player.bombs++;
      gameState.board[player.position] = Cell.EMPTY; // Powerup consumed
    }
  }

  currentTurn++;
  const visible = getVisibleData();
  const alivePlayerIds = Object.keys(visible.players);

  // Match ended: turn limit reached
  if (currentTurn >= MAX_TURNS) {
    return {
      type: 3,
      finalState: gameState,
      disqualified: disqualifiedList,
      data: Object.values(gameState.players).map((p) => ({
        id: p.id,
        score: p.isDead || MAX_TURNS * 2,
        status: p.isDead ? -1 : 1,
      })),
    };
  }

  // Match ended: 1 survivor
  if (alivePlayerIds.length === 1) {
    return {
      type: 3,
      finalState: gameState,
      disqualified: disqualifiedList,
      data: Object.values(gameState.players).map((p) => ({
        id: p.id,
        score: p.isDead || MAX_TURNS * 2,
        status: p.isDead ? -1 : 1,
      })),
    };
  }

  // Match ended: 0 survivors (draw / mutual destruction)
  if (alivePlayerIds.length === 0) {
    return {
      type: 3,
      finalState: gameState,
      disqualified: disqualifiedList,
      data: Object.values(gameState.players).map((p) => ({
        id: p.id,
        score: p.isDead,
        status: 0,
      })),
    };
  }

  // Match continues
  return {
    type: 2,
    disqualified: disqualifiedList,
    data: visible,
    state: gameState,
    nextTurn: alivePlayerIds,
  };
};

export { gameState };
