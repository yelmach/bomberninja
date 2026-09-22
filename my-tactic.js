// The board is a 20 x 20 grid stored as one list.
const BOARD_WIDTH = 20
const TOTAL_CELLS = 400
const DIRECTIONS = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1] // Up, down, left, right

// Values used by the game for each type of board cell.
const Cell = {
  EMPTY: 0,
  BRICK: 1,
  WALL: 2,
  BOMB: 4,
  EXPLOSION: 5,
  POWERUP_LIVE: 6,
  POWERUP_BOMB: 7,
  POWERUP_POWER: 8,
}

// Special moves understood by the game.
const Move = {
  PLACE_BOMB: -1,
  STAY: 0,
}

// Check that two positions touch without wrapping around a board edge.
function isNeighbor(fromPosition, toPosition) {
  if (toPosition < 0 || toPosition >= TOTAL_CELLS) return false
  const difference = Math.abs(toPosition - fromPosition)
  return difference === BOARD_WIDTH
    || (difference === 1
      && Math.floor(fromPosition / BOARD_WIDTH)
        === Math.floor(toPosition / BOARD_WIDTH))
}

// Return the open neighboring positions that a player can move to.
function getWalkableNeighbors(position, board) {
  return DIRECTIONS
    .map((direction) => position + direction)
    .filter((nextPosition) =>
      isNeighbor(position, nextPosition) && board[nextPosition] !== Cell.WALL
      && board[nextPosition] !== Cell.BRICK && board[nextPosition] !== Cell.BOMB
    )
}

// Return every position reached by a bomb blast.
function getBlastTiles(bombPosition, blastRange, board) {
  const blastTiles = new Set([bombPosition])
  for (const direction of DIRECTIONS) {
    for (let distance = 1; distance <= blastRange; distance++) {
      const targetPosition = bombPosition + direction * distance
      // A board edge or wall stops the blast.
      if (
        !isNeighbor(targetPosition - direction, targetPosition)
        || board[targetPosition] === Cell.WALL
      ) break
      blastTiles.add(targetPosition)
      // The blast hits a brick, but does not continue through it.
      if (board[targetPosition] === Cell.BRICK) break
    }
  }
  return blastTiles
}

// Measure the straight-line distance from a position to the board center.
const distanceToCenter = (position) =>
  Math.hypot(
    Math.floor(position / BOARD_WIDTH) - 9.5,
    (position % BOARD_WIDTH) - 9.5,
  )

// Count how many horizontal and vertical steps separate two positions.
const getStepDistance = (firstPosition, secondPosition) =>
  Math.abs(
    Math.floor(firstPosition / BOARD_WIDTH)
      - Math.floor(secondPosition / BOARD_WIDTH),
  )
  + Math.abs((firstPosition % BOARD_WIDTH) - (secondPosition % BOARD_WIDTH))

// Follow the saved search route backward and return its first step.
function getFirstStep(target, start, previousPosition) {
  let step = target
  while (previousPosition[step] !== start && previousPosition[step] !== -1) {
    step = previousPosition[step]
  }
  return step
}

// Follow the saved search route backward and rebuild the full path.
function getFullPath(target, start, previousPosition) {
  const path = []
  let currentPosition = target
  while (currentPosition !== start && currentPosition !== -1) {
    path.unshift(currentPosition)
    currentPosition = previousPosition[currentPosition]
  }
  return path
}

// Find bombs, explosions, and safe moves around the player.
function buildDangerMap(myPosition, board) {
  const activeBombs = []
  const lethal = new Set()

  // Read the board once to find every current danger.
  for (let position = 0; position < TOTAL_CELLS; position++) {
    if (board[position] === Cell.BOMB) {
      activeBombs.push(position)
    } else if (board[position] === Cell.EXPLOSION) {
      lethal.add(position) // This can be an explosion or the fire at the board edge.
    }
  }

  // Mark the positions that every active bomb can hit.
  const allBlast = new Set()
  for (const bombPosition of activeBombs) {
    for (const blastPosition of getBlastTiles(bombPosition, 3, board)) {
      allBlast.add(blastPosition)
    }
  }

  // Safe moves are walkable positions outside explosions and bomb blasts.
  const walkable = getWalkableNeighbors(myPosition, board)
  const safeMoves = walkable.filter((move) =>
    !lethal.has(move) && !allBlast.has(move)
  )

  return { activeBombs, lethal, allBlast, walkable, safeMoves }
}

// Follow the escape path after placing a bomb.
function followRetreatPlan(retreatPlan, myPosition, board, danger) {
  // Keep following the saved path while it is still usable.
  if (retreatPlan.path.length > 0) {
    const nextPosition = retreatPlan.path.shift()
    if (
      danger.walkable.includes(nextPosition) && !danger.lethal.has(nextPosition)
    ) {
      return nextPosition
    }
  }

  // Wait if the player has reached safety and no other bomb can hit this position.
  const myBlast = getBlastTiles(retreatPlan.bombPos, 3, board)
  const isSafeFromOwnBomb = !myBlast.has(myPosition)
    && !danger.lethal.has(myPosition)

  if (isSafeFromOwnBomb) {
    if (!danger.allBlast.has(myPosition)) {
      return Move.STAY
    }
  }

  // The caller will find another escape move if this plan is no longer safe.
  return null
}

// Choose the safest available move when the player is in danger.
function findEscapeMove(myPosition, danger) {
  // Prefer a safe move toward the center.
  if (danger.safeMoves.length > 0) {
    danger.safeMoves.sort((firstMove, secondMove) =>
      distanceToCenter(firstMove) - distanceToCenter(secondMove)
    )
    return danger.safeMoves[0]
  }

  const nonLethalMoves = danger.walkable.filter((move) =>
    !danger.lethal.has(move)
  )

  // If every move is in a blast path, move as far as possible from the nearest bomb.
  if (nonLethalMoves.length > 0 && danger.activeBombs.length > 0) {
    const nearestBomb = danger.activeBombs.reduce(
      (closestBomb, bombPosition) =>
        getStepDistance(myPosition, bombPosition)
            < getStepDistance(myPosition, closestBomb)
          ? bombPosition
          : closestBomb,
      danger.activeBombs[0],
    )
    nonLethalMoves.sort((firstMove, secondMove) =>
      getStepDistance(secondMove, nearestBomb)
      - getStepDistance(firstMove, nearestBomb)
    )
    return nonLethalMoves[0]
  }

  // Otherwise, use any position without fire and prefer the center.
  if (nonLethalMoves.length > 0) {
    nonLethalMoves.sort((firstMove, secondMove) =>
      distanceToCenter(firstMove) - distanceToCenter(secondMove)
    )
    return nonLethalMoves[0]
  }

  // If standing on fire, any walkable move is better than staying still.
  if (danger.walkable.length > 0) {
    danger.walkable.sort((firstMove, secondMove) =>
      distanceToCenter(firstMove) - distanceToCenter(secondMove)
    )
    return danger.walkable[0]
  }

  return Move.STAY
}

// Return the position of the nearest opponent.
function getClosestOpponent(myPosition, players, myId) {
  let closestOpponent = null
  for (const [playerId, playerPosition] of Object.entries(players)) {
    if (playerId !== myId && playerPosition !== undefined) {
      if (
        closestOpponent === null
        || getStepDistance(myPosition, playerPosition)
          < getStepDistance(myPosition, closestOpponent)
      ) {
        closestOpponent = playerPosition
      }
    }
  }
  return closestOpponent
}

// Find a short path that leaves the blast area before placing a bomb.
function findRetreatPath(myPosition, board, blast, danger, positionHistory) {
  // First, try to go back through recently visited positions.
  let path = []
  for (
    let index = positionHistory.length - 1;
    index >= 0 && path.length < 4;
    index--
  ) {
    const previousPosition = positionHistory[index]
    if (previousPosition !== myPosition && !path.includes(previousPosition)) {
      path.push(previousPosition)
      if (!blast.has(previousPosition)) break
    }
  }

  // If that does not work, search up to four steps for a safe position.
  if (path.length === 0 || blast.has(path[path.length - 1])) {
    const previousPosition = new Int16Array(TOTAL_CELLS).fill(-1)
    const distance = new Uint8Array(TOTAL_CELLS)
    const positionsToCheck = [myPosition]
    let nextIndex = 0
    let safePosition = -1

    while (nextIndex < positionsToCheck.length) {
      const currentPosition = positionsToCheck[nextIndex++]
      if (distance[currentPosition] > 4) break

      // A safe position is outside all blasts and fire.
      if (
        !blast.has(currentPosition) && !danger.allBlast.has(currentPosition)
        && !danger.lethal.has(currentPosition) && currentPosition !== myPosition
      ) {
        safePosition = currentPosition
        break
      }

      for (const neighbor of getWalkableNeighbors(currentPosition, board)) {
        if (
          neighbor !== myPosition && previousPosition[neighbor] === -1
          && !danger.allBlast.has(neighbor) && !danger.lethal.has(neighbor)
        ) {
          previousPosition[neighbor] = currentPosition
          distance[neighbor] = distance[currentPosition] + 1
          positionsToCheck.push(neighbor)
        }
      }
    }

    if (safePosition !== -1) {
      path = getFullPath(safePosition, myPosition, previousPosition)
    }
  }

  // Only return a path that ends outside the new bomb's blast.
  if (path.length > 0 && !blast.has(path[path.length - 1])) {
    return path
  }
  return null
}

// Decide whether to place a bomb and prepare a safe retreat path.
function planBombPlacement(
  myPosition,
  board,
  closestOpponent,
  danger,
  positionHistory,
  myActiveBomb,
  turn,
) {
  // Only place a bomb on an empty cell when no other bomb is close.
  const canPlaceBomb = board[myPosition] === Cell.EMPTY && myActiveBomb === null
  const noBombNearby = danger.activeBombs.every((bombPosition) =>
    getStepDistance(myPosition, bombPosition) > 3
  )
  if (!canPlaceBomb || !noBombNearby) return null

  // Place bombs beside bricks, but be more careful when the board starts shrinking.
  const isNextToBrick = DIRECTIONS.some((direction) =>
    isNeighbor(myPosition, myPosition + direction)
    && board[myPosition + direction] === Cell.BRICK
  )
  const canMoveCloserToCenter = danger.safeMoves.some((move) =>
    distanceToCenter(move) < distanceToCenter(myPosition)
  )
  const shouldBreakBrick = isNextToBrick
    && (turn < 90 || distanceToCenter(myPosition) <= 4.5
      || !canMoveCloserToCenter)

  // Also place a bomb when the nearest opponent is beside the player.
  const blast = getBlastTiles(myPosition, 1, board)
  const canAttack = closestOpponent !== null && blast.has(closestOpponent)

  if (shouldBreakBrick || canAttack) {
    // Do not place the bomb unless there is a safe way out.
    const retreatPath = findRetreatPath(
      myPosition,
      board,
      blast,
      danger,
      positionHistory,
    )
    if (retreatPath !== null) {
      return { bombPos: myPosition, path: retreatPath }
    }
  }

  return null
}

// Search for the best goal and return the first move toward it.
function findGoalMove(myPosition, board, closestOpponent, danger, turn) {
  const previousPosition = new Int16Array(TOTAL_CELLS).fill(-1)
  const distance = new Uint8Array(TOTAL_CELLS)
  const positionsToCheck = [myPosition]
  let nextIndex = 0

  let lifeTarget = -1
  let powerTarget = -1
  let brickTarget = -1
  let opponentTarget = -1

  while (nextIndex < positionsToCheck.length) {
    const currentPosition = positionsToCheck[nextIndex++]
    if (distance[currentPosition] > 20) break

    const cell = board[currentPosition]

    // First priority: extra life.
    if (
      cell === Cell.POWERUP_LIVE
      && (turn < 95 || distanceToCenter(currentPosition) <= 5.5)
    ) {
      lifeTarget = currentPosition
      break
    }

    // Second priority: bomb and power upgrades.
    if (
      powerTarget === -1
      && (cell === Cell.POWERUP_BOMB || cell === Cell.POWERUP_POWER)
    ) {
      if (turn < 90 || distanceToCenter(currentPosition) <= 4.5) {
        powerTarget = currentPosition
      }
    }

    // Third priority: a position beside a breakable brick.
    if (brickTarget === -1 && currentPosition !== myPosition) {
      const isNearBrick = DIRECTIONS.some((direction) =>
        isNeighbor(currentPosition, currentPosition + direction)
        && board[currentPosition + direction] === Cell.BRICK
      )
      if (
        isNearBrick && (turn < 90 || distanceToCenter(currentPosition) <= 4.5)
      ) brickTarget = currentPosition
    }

    // Fourth priority: move toward the nearest opponent.
    if (
      opponentTarget === -1 && closestOpponent !== null
      && currentPosition === closestOpponent && currentPosition !== myPosition
    ) {
      if (turn < 90 || distanceToCenter(closestOpponent) <= 4.5) {
        opponentTarget = currentPosition
      }
    }

    // Continue the search through walkable and safe positions.
    for (const neighbor of getWalkableNeighbors(currentPosition, board)) {
      if (
        neighbor !== myPosition && previousPosition[neighbor] === -1
        && !danger.allBlast.has(neighbor) && !danger.lethal.has(neighbor)
      ) {
        previousPosition[neighbor] = currentPosition
        distance[neighbor] = distance[currentPosition] + 1
        positionsToCheck.push(neighbor)
      }
    }
  }

  // Choose the first available target in the priority order above.
  const target = lifeTarget !== -1
    ? lifeTarget
    : powerTarget !== -1
    ? powerTarget
    : brickTarget !== -1
    ? brickTarget
    : opponentTarget

  if (target !== -1) {
    const firstStep = getFirstStep(target, myPosition, previousPosition)
    if (danger.safeMoves.includes(firstStep)) {
      return firstStep
    }
  }

  // If there is no goal, use a safe move toward the center.
  if (danger.safeMoves.length > 0) {
    danger.safeMoves.sort((firstMove, secondMove) =>
      distanceToCenter(firstMove) - distanceToCenter(secondMove)
    )
    return danger.safeMoves[0]
  }

  return Move.STAY
}

// Create the tactic. The returned function chooses one move on each turn.
export default (_initialState, playerId) => {
  let turn = 0
  let myActiveBomb = null
  const positionHistory = []
  let retreatPlan = null // { bombPos, path: [] }

  return (state) => {
    try {
      turn++
      const myPosition = state.players[playerId]
      const board = state.board
      if (myPosition === undefined) return Move.STAY

      // Forget the saved bomb and escape plan after the bomb explodes.
      if (myActiveBomb !== null && board[myActiveBomb] !== Cell.BOMB) {
        myActiveBomb = null
        retreatPlan = null
      }

      // Save recent positions so the player can quickly move back after placing a bomb.
      const rememberMove = (move) => {
        if (move > 0 && move !== myPosition) {
          positionHistory.push(myPosition)
          if (positionHistory.length > 25) positionHistory.shift()
        }
        return move
      }

      // First, check the nearby dangers.
      const danger = buildDangerMap(myPosition, board)

      // Continue the escape plan after placing a bomb.
      if (retreatPlan !== null) {
        const retreatMove = followRetreatPlan(
          retreatPlan,
          myPosition,
          board,
          danger,
        )
        if (retreatMove !== null) {
          return rememberMove(retreatMove)
        }
        retreatPlan = null
      }

      // Escape immediately when standing in fire or in a bomb's blast area.
      if (
        danger.lethal.has(myPosition)
        || (danger.allBlast.has(myPosition) && danger.activeBombs.length > 0)
      ) {
        return rememberMove(findEscapeMove(myPosition, danger))
      }

      const closestOpponent = getClosestOpponent(
        myPosition,
        state.players,
        playerId,
      )

      // Place a bomb only when there is a reason and a safe escape path.
      const bombPlan = planBombPlacement(
        myPosition,
        board,
        closestOpponent,
        danger,
        positionHistory,
        myActiveBomb,
        turn,
      )
      if (bombPlan !== null) {
        myActiveBomb = myPosition
        retreatPlan = bombPlan
        return Move.PLACE_BOMB
      }

      // Otherwise, move toward the best goal found on the board.
      return rememberMove(
        findGoalMove(myPosition, board, closestOpponent, danger, turn),
      )
    } catch (_err) {
      return Move.STAY // Stay still if an unexpected error happens.
    }
  }
}