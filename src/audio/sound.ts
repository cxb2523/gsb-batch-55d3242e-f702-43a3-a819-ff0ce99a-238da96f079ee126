/**
 * WebAudio 程序化音频：全部音效与 BGM 由振荡器合成，零音频素材。
 */

type SfxName =
  | 'click' | 'plant' | 'water' | 'harvest' | 'coin' | 'levelup'
  | 'splash' | 'reel' | 'catch' | 'hit' | 'crit' | 'miss' | 'roar'
  | 'eat' | 'happy' | 'error' | 'build' | 'quest';

let actx: AudioContext | null = null;
let soundOn = true;
let musicOn = true;
let bgmTimer: number | null = null;
let bgmGain: GainNode | null = null;

function ctx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!actx) actx = new AudioContext();
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}

export function setSound(on: boolean): void {
  soundOn = on;
}

export function setMusic(on: boolean): void {
  musicOn = on;
  if (!on) stopBgm();
  else startBgm();
}

function tone(
  freq: number, dur: number, type: OscillatorType = 'sine',
  vol = 0.16, delay = 0, slide = 0,
): void {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 白噪声（水花/命中用） */
function noise(dur: number, vol = 0.1, delay = 0, lowpass = 2200): void {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
}

export function sfx(name: SfxName): void {
  if (!soundOn) return;
  switch (name) {
    case 'click': tone(660, 0.06, 'triangle', 0.08); break;
    case 'plant': tone(320, 0.1, 'sine', 0.14, 0, -60); noise(0.08, 0.04, 0, 900); break;
    case 'water': noise(0.25, 0.09, 0, 1600); tone(520, 0.12, 'sine', 0.05, 0.02, 140); break;
    case 'harvest': tone(523, 0.09, 'triangle', 0.14); tone(659, 0.1, 'triangle', 0.14, 0.07); break;
    case 'coin': tone(880, 0.07, 'square', 0.07); tone(1318, 0.12, 'square', 0.07, 0.06); break;
    case 'levelup':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, i * 0.11));
      break;
    case 'splash': noise(0.35, 0.12, 0, 1200); tone(300, 0.18, 'sine', 0.06, 0.03, -120); break;
    case 'reel': tone(440, 0.05, 'square', 0.05); break;
    case 'catch':
      [659, 784, 1046].forEach((f, i) => tone(f, 0.13, 'triangle', 0.15, i * 0.09));
      break;
    case 'hit': noise(0.09, 0.13, 0, 2600); tone(180, 0.1, 'square', 0.1, 0, -60); break;
    case 'crit': noise(0.12, 0.16, 0, 3200); tone(140, 0.16, 'sawtooth', 0.12, 0, -70); tone(1100, 0.1, 'square', 0.06, 0.03); break;
    case 'miss': tone(240, 0.16, 'sine', 0.1, 0, -110); break;
    case 'roar': tone(110, 0.4, 'sawtooth', 0.12, 0, -45); noise(0.3, 0.06, 0.05, 500); break;
    case 'eat': tone(360, 0.07, 'triangle', 0.1); tone(300, 0.07, 'triangle', 0.1, 0.09); break;
    case 'happy': tone(784, 0.1, 'sine', 0.12); tone(988, 0.14, 'sine', 0.12, 0.09); break;
    case 'error': tone(200, 0.14, 'square', 0.07, 0, -40); break;
    case 'build': noise(0.12, 0.1, 0, 800); tone(150, 0.12, 'square', 0.09, 0.05, 30); break;
    case 'quest':
      [587, 740, 880].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, i * 0.1));
      break;
  }
}

/** 轻量 BGM：五声音阶随机琶音，海岛风摇篮节奏 */
const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];

function bgmStep(step: number): void {
  const ac = ctx();
  if (!ac || !musicOn) return;
  if (!bgmGain) {
    bgmGain = ac.createGain();
    bgmGain.gain.value = 0.5;
    bgmGain.connect(ac.destination);
  }
  const bar = Math.floor(step / 8) % 4;
  const idx = [0, 2, 4, 3][bar];
  // 低音
  if (step % 8 === 0) {
    playNote(SCALE[idx] / 2, 1.6, 'sine', 0.045);
  }
  // 琶音
  if (step % 2 === 0) {
    const options = [idx, idx + 2, idx + 4, idx + 3];
    const note = SCALE[options[Math.floor(Math.random() * options.length)] % SCALE.length];
    playNote(note, 0.5, 'triangle', 0.028);
  }
}

function playNote(freq: number, dur: number, type: OscillatorType, vol: number): void {
  const ac = ctx();
  if (!ac || !bgmGain) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);
  osc.connect(gain).connect(bgmGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.1);
}

let bgmStepCount = 0;

export function startBgm(): void {
  if (!musicOn || bgmTimer !== null || typeof window === 'undefined') return;
  bgmTimer = window.setInterval(() => {
    bgmStep(bgmStepCount++);
  }, 280);
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}
