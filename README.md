# Bomber Ninja Tactic Overview

This tactic controls the player one turn at a time. On every turn, it first checks for danger, then decides whether to escape, place a bomb, or move toward a useful target.

## Main Flow

The tactic remembers the turn number, its active bomb, and its current escape plan. It follows these steps on each turn:

1. **Check the board for danger**
   
   It finds all active bombs and explosions. It also calculates the positions that can be hit by each bomb. From this information, it creates a list of walkable moves and safe moves.

2. **Continue an escape plan**
   
   After placing a bomb, the player follows the short path that was found before the bomb was placed.

3. **Escape immediate danger**
   
   If the player is standing on fire or inside a bomb's blast area, escaping becomes the first priority. The tactic prefers a safe move toward the center. If no fully safe move exists, it tries to move away from the nearest bomb or at least leave the current fire position.

4. **Find the nearest opponent**
   
   The tactic checks the positions of the other players and selects the closest one. This opponent can later become an attack target.

5. **Decide whether to place a bomb**
   
   A bomb can be placed when:

   - The current position is empty.
   - The tactic does not already have an active bomb.
   - No other active bomb is too close.
   - The player is beside a brick, or an opponent is beside the player.
   - A safe escape path exists.

6. **Move toward the best goal**
   
   If there is no immediate danger and no bomb should be placed, the tactic searches for a useful target. The target order is:

   1. Extra life
   2. Bomb or power upgrade
   3. A position beside a breakable brick
   4. The nearest opponent

   The search only uses walkable positions that are outside explosions and bomb blast areas. After choosing a target, the tactic returns the first move along the path to it.

7. **Use a safe fallback**
   
   If no target is found, the player moves toward the center using a safe position. If no safe move is available, the player stays still.

## How Movement Works

The board is stored as a list of 400 cells, representing a 20 by 20 grid. A move changes the current position by one of four values: up, down, left, or right.

Before using a neighboring position, the tactic checks that it:

- Is still inside the board.
- Does not wrap from one side of a row to the other.
- Is not a wall, brick, or bomb.

## How Paths Are Found

The tactic uses a breadth-first search to explore nearby positions. This search checks the closest positions first, which helps it find short paths to safety or to a goal.

Before placing a bomb, the tactic uses a short search to confirm that a safe position can be reached within four moves. It saves that route and follows it after placing the bomb.

## Overall Strategy

The strategy can be summarized as:

> Stay alive first, place bombs only with an escape route, collect useful upgrades, break bricks, approach opponents, and move toward the center when there is no better goal.

The entire decision is protected by an error fallback. If an unexpected problem happens, the player stays still instead of returning an invalid move.
