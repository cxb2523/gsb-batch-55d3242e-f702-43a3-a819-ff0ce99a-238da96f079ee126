import assert from "node:assert/strict";
import { LinearFilter, PerspectiveCamera, RedFormat, RGBAFormat } from "three";
import type { ComputeNode } from "three/webgpu";
import { uniform } from "three/tsl";
import { test } from "vitest";
import GTVBAONode from "../src/GTVBAONode.js";

test("GTVBAONode variant values invalidate the shader variant", () => {
  const node = createTestGtvbaoNode();
  const material = getInternalMaterial(node);
  let invalidations = 0;
  node.setVariantChangeCallback(() => {
    invalidations += 1;
  });

  const initialNodeVersion = node.version;
  const initialMaterialVersion = material.version;
  node.stepCount.value = 12;

  assert.equal(node.stepCount.value, 12);
  assert.equal(invalidations, 1);
  assert.equal(node.version, initialNodeVersion + 1);
  assert.equal(material.version, initialMaterialVersion + 1);

  node.stepCount.value = 12;
  node.radius.value = 4;

  assert.equal(invalidations, 1);

  // expFactor and aoIntensity are uniforms with a build-time fast path at
  // their defaults; only crossing that boundary rebuilds the shader.
  node.expFactor.value = 3;

  assert.equal(invalidations, 2);
  assert.equal(node.version, initialNodeVersion + 2);
  assert.equal(material.version, initialMaterialVersion + 2);

  node.expFactor.value = 4;

  assert.equal(invalidations, 2);

  node.expFactor.value = 2;

  assert.equal(invalidations, 3);

  node.aoIntensity.value = 2;

  assert.equal(invalidations, 4);

  node.aoIntensity.value = 3;

  assert.equal(invalidations, 4);

  node.aoIntensity.value = 1;

  assert.equal(invalidations, 5);
  assert.equal(node.version, initialNodeVersion + 5);
  assert.equal(material.version, initialMaterialVersion + 5);

  node.batchVariantChanges(() => {
    node.stepCount.value = 10;
    node.usePerspectiveCorrectSlice.value = false;
  });

  assert.equal(invalidations, 6);
  assert.equal(node.version, initialNodeVersion + 6);
  assert.equal(material.version, initialMaterialVersion + 6);

  // Raw AO debug only switches the render target; the shader is unchanged.
  const versionBeforeRawDebug = node.version;
  const materialVersionBeforeRawDebug = material.version;
  node.debugMode.value = 1;

  assert.equal(node.debugMode.value, 1);
  assert.equal(invalidations, 7);
  assert.equal(node.version, versionBeforeRawDebug);
  assert.equal(material.version, materialVersionBeforeRawDebug);

  node.debugMode.value = 5;

  assert.equal(invalidations, 8);
  assert.equal(node.version, initialNodeVersion + 7);
  assert.equal(material.version, initialMaterialVersion + 7);

  node.debugMode.value = 4;

  assert.equal(invalidations, 9);
  assert.equal(node.version, initialNodeVersion + 8);

  // Out-of-range values clamp to the variant limits.
  node.sliceCount.value = 99;
  node.debugMode.value = -1;

  assert.equal(node.sliceCount.value, 8);
  assert.equal(node.debugMode.value, 0);
  assert.equal(invalidations, 11);
  assert.equal(node.version, initialNodeVersion + 10);
  assert.equal(material.version, initialMaterialVersion + 10);

  node.dispose();
});

test("GTVBAONode refreshes the internal AO material on sector measure changes", () => {
  const node = createTestGtvbaoNode();
  const materialVersion = getInternalMaterial(node).version;
  const fragmentRefreshes = installMaterialFragmentRefreshProbe(node);

  node.sectorMeasure.value = "angle";

  assert.deepEqual(fragmentRefreshes.consume(), ["angle"]);
  assert.equal(getInternalMaterial(node).version, materialVersion + 1);
  // Unknown values fall back to the cosine measure.
  (node.sectorMeasure as { value: unknown }).value = "bogus";
  assert.equal(node.sectorMeasure.value, "cosine");

  node.dispose();
});

test("GTVBAONode only upsamples by depth at reduced resolution with depth MIPs", () => {
  const node = createTestGtvbaoNode();

  assert.equal(node.useDepthAwareUpsample, true);
  assert.equal(node.isDepthAwareUpsampleActive(), false);
  node.resolutionScale = 0.5;
  assert.equal(node.isDepthAwareUpsampleActive(), true);
  node.useDepthMips.value = false;
  assert.equal(node.isDepthAwareUpsampleActive(), false);
  node.useDepthMips.value = true;
  node.useDepthAwareUpsample = false;
  assert.equal(node.isDepthAwareUpsampleActive(), false);

  node.dispose();
});

test("GTVBAONode switches compact AO and debug render targets", () => {
  const node = createTestGtvbaoNode();
  const internals = getGtvbaoRenderTargetInternals(node);

  assert.equal(internals._aoRenderTarget.texture.format, RedFormat);
  assert.equal(internals._debugRenderTarget.texture.format, RGBAFormat);
  assert.equal(internals._aoRenderTarget.texture.minFilter, LinearFilter);
  assert.equal(internals._aoRenderTarget.texture.magFilter, LinearFilter);

  node.resolutionScale = 0.5;
  node.setSize(320, 180);

  assert.equal(internals._aoRenderTarget.width, 160);
  assert.equal(internals._aoRenderTarget.height, 90);
  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);

  node.debugMode.value = 2;
  node.setSize(320, 180);

  assert.equal(internals._debugRenderTarget.width, 160);
  assert.equal(internals._debugRenderTarget.height, 90);
  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  node.debugMode.value = 0;
  node.setSize(640, 360);

  assert.equal(internals._aoRenderTarget.width, 320);
  assert.equal(internals._aoRenderTarget.height, 180);
  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);

  node.dispose();
});

test("GTVBAONode realigns both render targets immediately when debug mode switches", () => {
  const node = createTestGtvbaoNode();
  const internals = getGtvbaoRenderTargetInternals(node);

  node.resolutionScale = 0.5;
  node.setSize(320, 180);

  // The targets are already aligned for ordinary AO.
  assert.equal(internals._aoRenderTarget.width, 160);
  assert.equal(internals._aoRenderTarget.height, 90);
  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);

  // No setSize() between the switch and the assertions: the debug target must
  // already match the AO resolution derived from the current drawing buffer.
  node.debugMode.value = 2;

  assert.equal(internals._debugRenderTarget.width, 160);
  assert.equal(internals._debugRenderTarget.height, 90);
  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  // Raw AO (mode 1) is also a debug view and must realign without an intervening
  // setSize(); the shader itself is unchanged for this transition.
  node.debugMode.value = 1;

  assert.equal(internals._debugRenderTarget.width, 160);
  assert.equal(internals._debugRenderTarget.height, 90);
  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  // Switching back to ordinary AO restores the full AO target and shrinks the
  // debug target, again without waiting for the next frame's setSize().
  node.debugMode.value = 0;

  assert.equal(internals._aoRenderTarget.width, 160);
  assert.equal(internals._aoRenderTarget.height, 90);
  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);

  // The next setSize() with identical inputs must not resize anything: the
  // switch already brought the cached target identity up to date.
  const aoCalls = spyOnRenderTargetSetSize(internals._aoRenderTarget);
  const debugCalls = spyOnRenderTargetSetSize(internals._debugRenderTarget);
  node.setSize(320, 180);

  assert.equal(aoCalls.length, 0);
  assert.equal(debugCalls.length, 0);

  aoCalls.restore();
  debugCalls.restore();
  node.dispose();
});

test("GTVBAONode realigns render targets when a batched debug switch flushes", () => {
  const node = createTestGtvbaoNode();
  const internals = getGtvbaoRenderTargetInternals(node);

  node.resolutionScale = 0.5;
  node.setSize(400, 200);

  node.batchVariantChanges(() => {
    node.debugMode.value = 2;
    node.debugMode.value = 4;
  });

  assert.equal(node.debugMode.value, 4);
  assert.equal(internals._debugRenderTarget.width, 200);
  assert.equal(internals._debugRenderTarget.height, 100);
  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  // Batched switches back to ordinary AO realign on flush as well.
  node.batchVariantChanges(() => {
    node.debugMode.value = 0;
  });

  assert.equal(internals._aoRenderTarget.width, 200);
  assert.equal(internals._aoRenderTarget.height, 100);
  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);

  node.dispose();
});

test("GTVBAONode keeps at least a 1x1 active target after an immediate debug switch", () => {
  const node = createTestGtvbaoNode();
  const internals = getGtvbaoRenderTargetInternals(node);

  node.resolutionScale = 0.0001;
  node.setSize(2, 2);

  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  node.debugMode.value = 3;

  assert.equal(internals._debugRenderTarget.width, 1);
  assert.equal(internals._debugRenderTarget.height, 1);
  assert.equal(internals._aoRenderTarget.width, 1);
  assert.equal(internals._aoRenderTarget.height, 1);

  node.dispose();
});

test("GTVBAONode setSize is idempotent while size, projection and active target stay fixed", () => {
  const node = createTestGtvbaoNode();
  const internals = getGtvbaoRenderTargetInternals(node);
  const resolution = (node as unknown as { _resolution: { value: { x: number; y: number; set(x: number, y: number): void } } })._resolution;
  const halfProjScale = (node as unknown as { _halfProjScale: { value: number } })._halfProjScale;

  node.resolutionScale = 0.5;
  node.setSize(320, 180);

  const aoCalls = spyOnRenderTargetSetSize(internals._aoRenderTarget);
  const debugCalls = spyOnRenderTargetSetSize(internals._debugRenderTarget);
  const resolutionSets = spyOnVector2Set(resolution.value);
  const halfProjBefore = halfProjScale.value;

  node.setSize(320, 180);
  node.setSize(320, 180);

  assert.equal(aoCalls.length, 0);
  assert.equal(debugCalls.length, 0);
  assert.equal(resolutionSets.length, 0);
  assert.equal(halfProjScale.value, halfProjBefore);

  // After switching the active target, repeated setSize() calls at the same
  // drawing buffer likewise must not re-set either target or the uniforms.
  node.debugMode.value = 2;
  aoCalls.length = 0;
  debugCalls.length = 0;
  resolutionSets.length = 0;

  node.setSize(320, 180);
  node.setSize(320, 180);

  assert.equal(internals._debugRenderTarget.width, 160);
  assert.equal(internals._debugRenderTarget.height, 90);
  assert.equal(aoCalls.length, 0);
  assert.equal(debugCalls.length, 0);
  assert.equal(resolutionSets.length, 0);
  assert.equal(halfProjScale.value, halfProjBefore);

  aoCalls.restore();
  debugCalls.restore();
  resolutionSets.restore();
  node.dispose();
});

test("GTVBAONode clamps out-of-range debug modes to the variant limits with one notification", () => {
  const node = createTestGtvbaoNode();
  let notifications = 0;
  node.setVariantChangeCallback(() => {
    notifications += 1;
  });

  node.setSize(32, 32);

  node.debugMode.value = 99;
  assert.equal(node.debugMode.value, 5);
  assert.equal(notifications, 1);

  // Values above the upper limit clamp to the highest debug mode.
  node.debugMode.value = 1000;
  assert.equal(node.debugMode.value, 5);
  assert.equal(notifications, 1);

  // Negative and non-finite values fall back to the lower limit (ordinary AO).
  node.debugMode.value = -5;
  assert.equal(node.debugMode.value, 0);
  assert.equal(notifications, 2);

  node.debugMode.value = Number.NaN;
  assert.equal(node.debugMode.value, 0);
  assert.equal(notifications, 2);

  // Non-finite values fall back to the lower limit rather than clamping upward.
  node.debugMode.value = Number.POSITIVE_INFINITY;
  assert.equal(node.debugMode.value, 0);
  assert.equal(notifications, 2);

  // Fractional inputs are rounded to an integer mode before clamping.
  node.debugMode.value = 2.6;
  assert.equal(node.debugMode.value, 3);
  assert.equal(notifications, 3);

  node.dispose();
});

test("GTVBAONode releases depth kernels on depth-mode changes and disposal", () => {
  const node = createTestGtvbaoNode();
  const { _depthPrefilter: prefilter } = node as unknown as {
    _depthPrefilter: {
      compute(renderer: { compute(kernel: ComputeNode): void }): void;
      setLogarithmicDepthBuffer(value: boolean): void;
    };
  };
  const liveKernels = new Set<ComputeNode>();
  const renderer = {
    compute(kernel: ComputeNode) {
      if (liveKernels.has(kernel)) return;
      liveKernels.add(kernel);
      kernel.addEventListener("dispose", () => liveKernels.delete(kernel));
    },
  };
  node.setSize(64, 32);
  prefilter.compute(renderer);
  assert.equal(liveKernels.size, 2);

  prefilter.setLogarithmicDepthBuffer(false);
  assert.equal(liveKernels.size, 2);

  prefilter.setLogarithmicDepthBuffer(true);
  assert.equal(liveKernels.size, 0);

  prefilter.compute(renderer);
  assert.equal(liveKernels.size, 2);

  node.dispose();
  assert.equal(liveKernels.size, 0);
});

function createTestGtvbaoNode() {
  return new GTVBAONode(uniform(1) as never, null, new PerspectiveCamera());
}

function getInternalMaterial(node: GTVBAONode) {
  return (node as unknown as { _material: { version: number } })._material;
}

function installMaterialFragmentRefreshProbe(node: GTVBAONode) {
  const internals = node as unknown as {
    _refreshMaterialFragmentNode(): void;
    _fragmentContext: object | null;
  };
  const refreshes: string[] = [];
  const original = internals._refreshMaterialFragmentNode.bind(node);
  // Simulate a post-setup() state so the real refresh rebuilds the fragment node.
  internals._fragmentContext = {};
  internals._refreshMaterialFragmentNode = () => {
    refreshes.push(node.sectorMeasure.value);
    original();
  };
  return {
    consume() {
      const current = [...refreshes];
      refreshes.length = 0;
      return current;
    },
  };
}

function getGtvbaoRenderTargetInternals(node: GTVBAONode) {
  return node as unknown as {
    _aoRenderTarget: {
      height: number;
      setSize(width: number, height: number): void;
      texture: { format: number; magFilter: number; minFilter: number };
      width: number;
    };
    _debugRenderTarget: {
      height: number;
      setSize(width: number, height: number): void;
      texture: { format: number };
      width: number;
    };
  };
}

function spyOnRenderTargetSetSize(target: { setSize(width: number, height: number): void }) {
  const original = target.setSize.bind(target);
  const calls: Array<{ width: number; height: number }> = [];
  target.setSize = (width: number, height: number) => {
    calls.push({ width, height });
    original(width, height);
  };
  return Object.assign(calls, {
    restore() {
      target.setSize = original;
    },
  });
}

function spyOnVector2Set(vector: { set(x: number, y: number): void }) {
  const original = vector.set.bind(vector);
  const calls: Array<{ x: number; y: number }> = [];
  vector.set = (x: number, y: number) => {
    calls.push({ x, y });
    original(x, y);
  };
  return Object.assign(calls, {
    restore() {
      vector.set = original;
    },
  });
}
