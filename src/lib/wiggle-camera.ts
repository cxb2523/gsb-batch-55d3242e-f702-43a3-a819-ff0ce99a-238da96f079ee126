import { radiusFor, type Snake } from './wiggle-snake';
import type { World } from './wiggle-world';

/** The view follows either the player or, while there is none, the biggest living snake. */
export type Camera = { x: number; y: number; zoom: number; focusId?: number | null };
export type CameraScreen = { w: number; h: number };

const FOLLOW_RATE = 4;
const ZOOM_RATE = 3;
const MENU_ZOOM = 0.75;

export function largestAliveSnake(world: World): Snake | null {
  let biggest: Snake | null = null;
  for (const snake of world.snakes) {
    if (!snake.alive) continue;
    // Stable tie-break by id keeps two equally big snakes from making the view flicker.
    if (
      !biggest ||
      snake.mass > biggest.mass ||
      (snake.mass === biggest.mass && snake.id < biggest.id)
    )
      biggest = snake;
  }
  return biggest;
}

export function cameraTarget(world: World): Snake | null {
  const player = world.player;
  if (player?.alive) return player;
  return largestAliveSnake(world);
}

/** Alias used by tests and by the arena loop: while the player is gone, watch the biggest snake. */
export const selectCameraTarget = cameraTarget;
export const pickCameraTarget = cameraTarget;
export const biggestAliveSnake = largestAliveSnake;

export function zoomForTarget(target: Snake, screen: CameraScreen): number {
  const scale = Math.min(screen.w, screen.h) / (450 + radiusFor(target.mass) * 18);
  return scale * (target.isPlayer ? 1 : MENU_ZOOM);
}

function ease(rate: number, dt: number) {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

/**
 * Move the camera toward its current target. A fresh player snaps into place (so a restart
 * never drags the previous round's position or zoom behind it); after a death, or on the
 * menu, the view glides over to the biggest living snake instead of freezing on the corpse.
 */
export function followCamera(cam: Camera, world: World, screen: CameraScreen, dt: number) {
  const target = cameraTarget(world);
  if (!target) {
    cam.focusId = null;
    return;
  }

  const head = target.body[0];
  const zoom = zoomForTarget(target, screen);
  const freshPlayer = target.isPlayer && cam.focusId !== target.id;
  if (freshPlayer) {
    cam.x = head.x;
    cam.y = head.y;
    cam.zoom = zoom;
  } else if (target.isPlayer) {
    cam.x = head.x;
    cam.y = head.y;
    cam.zoom += (zoom - cam.zoom) * ease(ZOOM_RATE, dt);
  } else {
    const follow = ease(FOLLOW_RATE, dt);
    cam.x += (head.x - cam.x) * follow;
    cam.y += (head.y - cam.y) * follow;
    cam.zoom += (zoom - cam.zoom) * ease(ZOOM_RATE, dt);
  }
  cam.focusId = target.id;
}
