Bomberninja: A Strategic Action Game
Bomberninja is a classic action game where players place bombs to eliminate opponents and destroy obstacles. The goal is to survive as long as possible while strategically using bombs to outmaneuver and defeat other players.

How to Play
Basic Rules
Move your character around the grid to avoid bombs and collect power-ups.
Place bombs to destroy bricks, open paths, and trap your opponents.
Bombs explode after a short delay, destroying everything in their blast radius except indestructible walls.
Collect power-ups to increase your bomb range or gain special abilities.
After turn 100, a fire belt will begin advancing from the edges of the board every 3 turns, forcing players toward the center.
The last player alive wins the game.
Fire Belt Shrinking Mechanism
Starting at turn 100, a deadly fire belt begins advancing from all four edges of the board. The fire advances every 3 turns, progressively shrinking the playable area and forcing players toward the center. Players caught in the fire belt are eliminated. This mechanism ensures games don't last indefinitely and creates strategic pressure for positioning.

Winning Conditions
The winner is the last player remaining on the board, either by eliminating opponents with bombs or by surviving the fire belt shrinkage.

Game Representation
Bomberninja Board
◼️ = 2 = WALL, 💣 = 4 = BOMB, 🧱 = 1 = BRICK

Data Layout
The game board is represented as a linear array of 400 cells (20x20 grid), indexed from 0 to 399.

Cell Values:
0 = EMPTY
1 = BRICK 🧱
2 = WALL ◼️
4 = BOMB 💣
5 = EXPLOSION 💥
6 = POWERUP_LIVE ❤️
7 = POWERUP_BOMB 💣+1
8 = POWERUP_POWER 🧨
Instructions for Your Tactic
Key Strategy Tips
Stay mobile and avoid getting trapped in corners or against walls.
Plan your bomb placements carefully to create escape routes.
Collect power-ups to increase your bomb range and survivability.
Position yourself away from board edges before turn 100 to avoid the advancing fire belt.
Use the fire belt strategically to trap opponents as the board shrinks.
Code Example
  
/**
* Default function for your tactic.
* Determines the next move based on the game's state.
*
* @param {Object} initialState - Initial state for the game (optional).
* @param {string} playerId - Player identifier (your unique ID).
* @returns {Function} - A function that takes the current game state and returns a valid move.
*/
  
  // Write your tactic logic below.
  
const BOARD_WIDTH = 20

// Cell types
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

// Movement constants
const Move = {
  PLACE_BOMB: -1,
  STAY: 0,
}

// Basic utility functions
const isValidPosition = (pos) => pos >= 0 && pos < BOARD_WIDTH * BOARD_WIDTH

const getValidMoves = (position, board) => {
  const moves = []
  const directions = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1] // up, down, left, right

  for (const dir of directions) {
    const newPos = position + dir
    if (isValidPosition(newPos) &&
        board[newPos] !== Cell.WALL &&
        board[newPos] !== Cell.BRICK &&
        board[newPos] !== Cell.BOMB) {
      moves.push(newPos)
    }
  }

  return moves
}

const hasNearbyBrick = (position, board) => {
  const directions = [-BOARD_WIDTH, BOARD_WIDTH, -1, 1]
  return directions.some(dir => board[position + dir] === Cell.BRICK)
}

const isSafeFromBombs = (position, bombs) => {
  // Simple check: avoid positions in the same row/column as bombs
  for (const bombPos of bombs) {
    const myRow = Math.floor(position / BOARD_WIDTH)
    const myCol = position % BOARD_WIDTH
    const bombRow = Math.floor(bombPos / BOARD_WIDTH)
    const bombCol = bombPos % BOARD_WIDTH

    // If in same row or column within blast range (3 cells)
    if ((myRow === bombRow && Math.abs(myCol - bombCol) <= 3) ||
        (myCol === bombCol && Math.abs(myRow - bombRow) <= 3)) {
      return false
    }
  }
  return true
}

export default (_initialState, playerId) => {
  return (state) => {
    const myPosition = state.players[playerId]

    // Find all bombs on the board
    const bombs = []
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === Cell.BOMB) {
        bombs.push(i)
      }
    }

    // Get valid moves
    const validMoves = getValidMoves(myPosition, state.board)

    // Avoid bombs if in danger
    if (!isSafeFromBombs(myPosition, bombs)) {
      const safeMoves = validMoves.filter(move => isSafeFromBombs(move, bombs))
      if (safeMoves.length > 0) {
        return safeMoves[0]
      }
    }

    // Place bomb to clear path if blocked and safe to do so
    if (hasNearbyBrick(myPosition, state.board) &&
        validMoves.length >= 2 &&
        isSafeFromBombs(myPosition, bombs)) {
      return Move.PLACE_BOMB
    }

    // Simple exploration: move randomly to explore the board
    if (validMoves.length > 0) {
      return validMoves[Math.floor(Math.random() * validMoves.length)]
    }

    return Move.STAY
  }
}
    
  
Additional Information
In Bomberninja, place bombs and make everything go boom!

Bomberninja follows gameplay principles similar to those found in the Bomberman series. To learn more about the original concept, game rules, and its variations, refer to the Wikipedia article on Bomberman.