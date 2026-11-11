#!/usr/bin/env node
/**
 * Node-only checks for the dusk lighting pass:
 *   1. the sun shadow frustum half-extent is `q.shadowExtent` (default 30),
 *      and the texel snap uses that same extent;
 *   2. the shadow bias keeps its old formula and scales with the map size;
 *   3. street lamps ramp continuously with `timeOfDay`;
 *   4. the visible point-light count is constant across the day/night cycle.
 *
 * The systems are driven with real three.js lights/cameras/vectors and minimal
 * fake ctx objects — no WebGL context and no DOM. Run it with:
 *
 *   node example/lightingtest.mjs
 *
 * Every row prints the measured and expected value; any failure exits non-zero.
 */
import * as THREE from 'three';
import { Rng } from '../lib/rng.js';
import {
  RenderSystem,
  DEFAULT_SHADOW_EXTENT,
  shadowExtentOf,
  shadowTexelSize,
  shadowBiasFor,
  configureShadowCamera,
} from './systems/render.js';
import { WorldSystem, lampIntensityAt } from './systems/world.js';

let total = 0;
let failures = 0;

const fmt = (v) => {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(8);
};

function section(title) {
  console.log(`\n${title}`);
}

/** Print one `label: measured vs expected` row and tally pass/fail. */
function check(label, measured, expected, { tol = 0, unit = '' } = {}) {
  total++;
  const numeric = Number.isFinite(measured) && Number.isFinite(expected);
  const pass = numeric ? Math.abs(measured - expected) <= tol : measured === expected;
  if (!pass) failures++;
  const m = `${fmt(measured)}${unit}`;
  const e = `${fmt(expected)}${unit}`;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} measured=${m.padEnd(14)} expected=${e}`);
}

/** Fit the shadow camera through the same helper RenderSystem.init uses. */
function fitSun(q) {
  const sun = new THREE.DirectionalLight();
  configureShadowCamera(sun, q);
  return sun.shadow.camera;
}

/** Run the real RenderSystem.lateUpdate with a fake camera and ctx. */
function snapWith(q, x, z) {
  const render = Object.create(RenderSystem.prototype);
  render.sun = new THREE.DirectionalLight();
  render.sun.position.set(37, 50, 24);
  render._sunDir = new THREE.Vector3();
  const camera = { position: new THREE.Vector3(x, 1.7, z) };
  render.lateUpdate(0, { camera, config: { q } });
  return render.sun.target.position;
}

/** Minimal fake world context; only the fields WorldSystem.init touches. */
async function makeWorld() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
  const render = {
    timeOfDay: 16.5,
    renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
  };
  const ctx = {
    scene,
    camera,
    rng: new Rng(0x5eed1234),
    config: { q: { anisotropy: 8, maxDynamicLights: 4 } },
    get: (id) => (id === 'render' ? render : null),
  };
  const world = new WorldSystem();
  await world.init(ctx);
  return { world, ctx, render };
}

function visiblePointLights(root) {
  let n = 0;
  root.traverse((o) => {
    if (o.isPointLight && o.visible) n++;
  });
  return n;
}

const TIMES = [
  ['18.5 (dusk starts)', 18.5, 0],
  ['19.25 (dusk mid)', 19.25, 6],
  ['20.0 (dusk complete)', 20, 12],
  ['5.75 (dawn mid)', 5.75, 6],
  ['6.5 (dawn complete)', 6.5, 0],
];

async function main() {
  const baseQ = { shadowMapSize: 2048, shadowDistance: 90 };
  const customQ = { ...baseQ, shadowExtent: 12 };

  section('shadow camera — default extent is still 30');
  check('shadowExtentOf(no override)', shadowExtentOf(baseQ), 30, { tol: 0 });
  const dc = fitSun(baseQ);
  check('default camera.left', dc.left, -30);
  check('default camera.right', dc.right, 30);
  check('default camera.top', dc.top, 30);
  check('default camera.bottom', dc.bottom, -30);

  section('shadow camera — q.shadowExtent is honoured');
  check('shadowExtentOf(q.shadowExtent=12)', shadowExtentOf(customQ), 12, { tol: 0 });
  const cc = fitSun(customQ);
  check('custom camera.left', cc.left, -12);
  check('custom camera.right', cc.right, 12);
  check('custom camera.top', cc.top, 12);
  check('custom camera.bottom', cc.bottom, -12);

  section('shadow snapping — texel uses the configured extent');
  const defaultTexel = (2 * DEFAULT_SHADOW_EXTENT) / baseQ.shadowMapSize;
  check('default texel size', shadowTexelSize(baseQ), defaultTexel, { tol: 1e-15 });
  const dp = snapWith(baseQ, 1.2345, -2.3456);
  check('default snapped x', dp.x, Math.round(1.2345 / defaultTexel) * defaultTexel, { tol: 1e-12 });
  check('default snapped z', dp.z, Math.round(-2.3456 / defaultTexel) * defaultTexel, { tol: 1e-12 });

  const customTexel = (2 * customQ.shadowExtent) / customQ.shadowMapSize;
  check('custom texel size', shadowTexelSize(customQ), customTexel, { tol: 1e-15 });
  const cp = snapWith(customQ, 1.2345, -2.3456);
  check('custom snapped x', cp.x, Math.round(1.2345 / customTexel) * customTexel, { tol: 1e-12 });
  check('custom snapped z', cp.z, Math.round(-2.3456 / customTexel) * customTexel, { tol: 1e-12 });

  section('shadow bias — same formula, scaled by map size');
  for (const size of [1024, 2048, 4096]) {
    check(`bias @ ${size}px`, shadowBiasFor({ shadowMapSize: size }), -0.0006 * (2048 / size), { tol: 1e-15 });
  }

  section('lamp brightness — five times of day');
  for (const [label, hour, want] of TIMES) {
    check(label, lampIntensityAt(hour), want, { tol: 1e-9 });
  }

  section('WorldSystem — lamps are owned and parented to root');
  const { world, ctx, render } = await makeWorld();
  check('lamp count', world.lamps.length, 4, { tol: 0 });
  for (const [i, lamp] of world.lamps.entries()) {
    check(`lamp ${i} parent is world.root`, lamp.parent === world.root, true);
  }
  check('visible point lights at init', visiblePointLights(world.root), world.lamps.length, { tol: 0 });

  section('day/night cycle — brightness and constant visible point lights');
  const expectedCount = world.lamps.length;
  for (const [label, hour, want] of [...TIMES, ['21.0 (night)', 21, 12], ['12.0 (day)', 12, 0]]) {
    render.timeOfDay = hour;
    world.update(0, ctx);
    world.lateUpdate();
    check(`${label} lamp 0 intensity`, world.lamps[0].intensity, want, { tol: 1e-9 });
    check(`${label} all lamps match`, world.lamps.every((l) => Math.abs(l.intensity - want) <= 1e-9), true);
    check(`${label} off lamps stay visible`, world.lamps.every((l) => l.visible === true), true);
    check(`${label} visible point lights`, visiblePointLights(world.root), expectedCount, { tol: 0 });
  }

  world.dispose();
  console.log('');
  if (failures) {
    console.log(`${failures} of ${total} checks FAILED`);
    process.exit(1);
  }
  console.log(`all ${total} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nTEST ERROR:', err?.stack ?? err);
  process.exit(1);
});
