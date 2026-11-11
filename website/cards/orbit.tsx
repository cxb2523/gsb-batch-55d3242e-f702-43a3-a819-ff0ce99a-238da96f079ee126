import { useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Label, Slider, SliderThumb, SliderTrack, Switch } from "react-aria-components";

function Nucleus() {
  const seeds = [];
  for (let i = 0; i < 11; i++) {
    const y = 1 - (i / 10) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * 0.62;
    const a = i * 2.399963;
    seeds.push({ p: [Math.cos(a) * r, y * 0.62, Math.sin(a) * r], s: 0.13 + ((i * 7) % 5) * 0.028, c: ["#6aa0ff", "#8ab8ff", "#cfe0ff", "#4f7ac8"][i % 4] });
  }
  return (
    <group userData={{ spin: [0.07, 0.17, 0] }}>
      {seeds.map((s, i) => (
        <mesh key={i} position={s.p}>
          <sphereGeometry args={[s.s, 24, 24]} />
          <meshStandardMaterial color={s.c} roughness={0.34} metalness={0.2} flatShading emissive={s.c} emissiveIntensity={0.22} />
        </mesh>
      ))}
      <pointLight userData={{ pulse: true }} color="#7ab0ff" intensity={2.6} distance={7} />
    </group>
  );
}

// One clock for the whole scene, kept on the scene itself: an edit remounts every component inside
// the canvas, and anything they counted for themselves would start again from zero.
function Tick({ speed }) {
  useFrame((state, dt) => {
    // A frame can arrive with the attribute the normalizer dropped (`<Tick />`), and one NaN here
    // would poison this shared total for good: every `userData.spin` group would rotate to NaN and
    // vanish, while the shells around them kept drawing. Step 0 on a frame that cannot be trusted.
    const step = Number.isFinite(dt) && Number.isFinite(speed) ? dt * speed : 0;
    const t = (state.scene.userData.t = (state.scene.userData.t ?? 0) + step);
    state.scene.traverse((o) => {
      const s = o.userData.spin;
      if (s) o.rotation.set(s[0] * t, s[1] * t, s[2] * t);
      if (o.userData.pulse) o.intensity = 2.6 + Math.sin(state.clock.elapsedTime * 1.35) * 0.5;
    });
  });
  return null;
}

function Shell({ radius, tilt, spin, count }) {
  const beads = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    beads.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  return (
    <group rotation={[tilt, 0.2, 0]}>
      <mesh>
        <torusGeometry args={[radius, 0.0075, 8, 200]} />
        <meshBasicMaterial color="#7aaaff" transparent opacity={0.42} />
      </mesh>
      <group userData={{ spin: [0, 0, spin] }}>
        {beads.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.088, 18, 18]} />
            <meshBasicMaterial color="#f2f7ff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Dust({ count, radius, spin, size, opacity, spread }) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963;
    const d = radius * (0.62 + (((i * 97) % 100) / 100) * spread);
    pos[i * 3] = Math.cos(th) * r * d;
    pos[i * 3 + 1] = y * d * 0.55;
    pos[i * 3 + 2] = Math.sin(th) * r * d;
  }
  return (
    <points userData={{ spin: [0, spin, 0] }}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color="#8ab4ff" transparent opacity={opacity} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default function Atom() {
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffffff1f] bg-[#232324] text-[#f9fafb]">
      <div className="h-[300px] w-full bg-[#12151d]">
        <Canvas camera={{ position: [0, 1.15, 8.2], fov: 48 }} resize={{ debounce: 0 }}>
          <ambientLight intensity={0.45} />
          <directionalLight position={[5, 3, 4]} intensity={2.1} />
          <directionalLight position={[-5, -2, -3]} intensity={0.9} color="#7aaaff" />
          <Tick speed={paused ? 0 : speed} />
          <Nucleus />
          <Shell radius={1.5} tilt={0.28} spin={2.9} count={1} />
          <Shell radius={2.05} tilt={0.55} spin={1.6} count={2} />
          <Shell radius={2.65} tilt={0.85} spin={0.85} count={3} />
          <Dust count={320} radius={4.1} spin={0.05} size={0.026} opacity={0.55} spread={0.38} />
          <Dust count={140} radius={3.7} spin={-0.1} size={0.018} opacity={0.13} spread={0.3} />
        </Canvas>
      </div>
      <div className="flex items-center gap-5 px-5 py-4">
        <Slider value={speed} onChange={setSpeed} minValue={0.2} maxValue={4} step={0.1} className="flex flex-1 flex-col gap-1.5">
          <Label className="text-[13px] text-[#cfd3d6]">Time ×{speed.toFixed(1)}</Label>
          <SliderTrack className="relative h-5 w-full">
            <div className="absolute top-[9px] h-[2px] w-full rounded-full bg-[#ffffff29]" />
            <SliderThumb className="top-2.5 h-4 w-4 rounded-full bg-[#f9fafb] outline-none" />
          </SliderTrack>
        </Slider>
        <Switch isSelected={paused} onChange={setPaused} className="group flex items-center gap-2 text-[13px] text-[#cfd3d6]">
          <span className="flex h-5 w-9 items-center rounded-full bg-[#43454a] px-0.5 transition-colors group-data-[selected]:bg-[#7aaaff]">
            <span className="h-4 w-4 rounded-full bg-white transition-transform group-data-[selected]:translate-x-4" />
          </span>
          Pause
        </Switch>
      </div>
    </div>
  );
}
