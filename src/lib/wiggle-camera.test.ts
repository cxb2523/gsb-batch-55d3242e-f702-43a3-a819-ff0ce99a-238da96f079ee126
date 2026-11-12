import { describe, expect, it } from 'vitest';

import {
  cameraTarget,
  followCamera,
  largestAliveSnake,
  selectCameraTarget,
  zoomForTarget,
  type Camera,
} from './wiggle-camera';
import { createSnake, type Snake } from './wiggle-snake';
import { createWorld, type World } from './wiggle-world';

const SCREEN = { w: 800, h: 600 };
let nextId = 1;

function snake(mass: number, x: number, y: number, isPlayer = false, id = nextId++): Snake {
  return createSnake({ id, name: `S${id}`, skin: 0, isPlayer, mass, angle: 0, x, y });
}

function worldWith(snakes: Snake[], player: Snake | null = null): World {
  const world = createWorld(8, () => 0.5);
  world.snakes = snakes;
  world.player = player;
  world.foods = [];
  return world;
}

describe('camera target', () => {
  it('follows the player while it is alive, even when bots are bigger', () => {
    const player = snake(20, 10, 20, true);
    const giant = snake(900, -800, 400);
    const world = worldWith([giant, player], player);

    expect(cameraTarget(world)).toBe(player);
    expect(selectCameraTarget(world)).toBe(player);
  });

  it('turns to the biggest living snake once the player is dead', () => {
    const player = snake(250, 0, 0, true);
    player.alive = false;
    const giant = snake(1300, 1200, -600);
    const corpse = snake(5000, -2000, 0);
    corpse.alive = false;
    const world = worldWith([player, giant, corpse], player);

    expect(cameraTarget(world)).toBe(giant);
    expect(largestAliveSnake(world)).toBe(giant);
  });

  it('also shows the biggest living snake on the menu, where there is no player', () => {
    const big = snake(700, 300, 900);
    const small = snake(30, -400, 100);
    const world = worldWith([small, big], null);

    expect(cameraTarget(world)).toBe(big);
  });

  it('picks a stable winner when two snakes are equally big', () => {
    const first = snake(400, 0, 0, false, 11);
    const second = snake(400, 500, 0, false, 9);
    const world = worldWith([first, second]);

    expect(largestAliveSnake(world)).toBe(second);
    expect(cameraTarget(world)).toBe(second);
  });

  it('returns null when nothing on the field is alive', () => {
    const player = snake(100, 0, 0, true);
    player.alive = false;
    const world = worldWith([player], player);

    expect(largestAliveSnake(world)).toBeNull();
    expect(cameraTarget(world)).toBeNull();
  });
});

describe('followCamera', () => {
  it('snaps a fresh player into view without keeping the old round position or zoom', () => {
    const player = snake(20, 150, -80, true);
    const world = worldWith([player], player);
    const cam: Camera = { x: 5000, y: -5000, zoom: 0.02, focusId: 12345 };

    followCamera(cam, world, SCREEN, 1 / 60);

    expect(cam.x).toBe(player.body[0].x);
    expect(cam.y).toBe(player.body[0].y);
    expect(cam.zoom).toBeCloseTo(zoomForTarget(player, SCREEN), 10);
    expect(cam.focusId).toBe(player.id);
  });

  it('keeps the living player exactly centred after the first frame', () => {
    const player = snake(20, 40, 60, true);
    const world = worldWith([player], player);
    const cam: Camera = { x: 0, y: 0, zoom: 1, focusId: player.id };
    player.body[0].x = 400;
    player.body[0].y = -200;

    followCamera(cam, world, SCREEN, 1 / 60);

    expect(cam.x).toBe(400);
    expect(cam.y).toBe(-200);
  });

  it('glides smoothly to the biggest survivor after the player dies', () => {
    const player = snake(100, 0, 0, true);
    const giant = snake(1200, 1000, 0);
    const world = worldWith([player, giant], player);
    const cam: Camera = { x: 0, y: 0, zoom: 1, focusId: player.id };
    player.alive = false;

    followCamera(cam, world, SCREEN, 1 / 60);

    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(giant.body[0].x);
    expect(cam.y).toBeCloseTo(0);

    for (let i = 0; i < 300; i++) {
      followCamera(cam, world, SCREEN, 1 / 60);
      expect(cam.x).toBeLessThanOrEqual(giant.body[0].x);
    }
    expect(cam.x).toBeCloseTo(giant.body[0].x, 1);
    expect(cam.focusId).toBe(giant.id);
  });

  it('holds the view still when there is nothing left to watch', () => {
    const player = snake(100, 0, 0, true);
    player.alive = false;
    const world = worldWith([player], player);
    const cam: Camera = { x: 200, y: -100, zoom: 0.5, focusId: player.id };

    followCamera(cam, world, SCREEN, 1 / 60);

    expect(cam).toEqual({ x: 200, y: -100, zoom: 0.5, focusId: null });
  });
});

describe('zoomForTarget', () => {
  it('zooms in more on a small snake than on a giant one', () => {
    const small = snake(20, 0, 0, true, 1);
    const giant = snake(3000, 0, 0, true, 2);

    expect(zoomForTarget(small, SCREEN)).toBeGreaterThan(zoomForTarget(giant, SCREEN));
  });

  it('pulls back a little when following a bot instead of the player', () => {
    const bot = snake(20, 0, 0, false, 1);
    const player = snake(20, 0, 0, true, 2);

    expect(zoomForTarget(bot, SCREEN)).toBeLessThan(zoomForTarget(player, SCREEN));
  });
});
