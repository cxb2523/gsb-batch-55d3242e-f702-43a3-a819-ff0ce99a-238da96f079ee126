import { useCallback, useEffect, useRef } from 'react';

const GAME_AUDIO_ROOT = '/game/audio';

export const GAME_MUSIC_ASSET = `${GAME_AUDIO_ROOT}/gameplay-music.ogg`;

export const GAME_SOUND_ASSETS = {
  challengeComplete: `${GAME_AUDIO_ROOT}/challenge-complete.ogg`,
  comboClear: `${GAME_AUDIO_ROOT}/combo-clear.mp3`,
  gameOver: `${GAME_AUDIO_ROOT}/game-over.ogg`,
  gameStart: `${GAME_AUDIO_ROOT}/game-start.ogg`,
  invalidMove: `${GAME_AUDIO_ROOT}/invalid-move.ogg`,
  lineClear: `${GAME_AUDIO_ROOT}/line-clear.mp3`,
  multiLineClear: `${GAME_AUDIO_ROOT}/multi-line-clear.mp3`,
  place: `${GAME_AUDIO_ROOT}/block-place.mp3`,
  uiTap: `${GAME_AUDIO_ROOT}/ui-tap.mp3`,
} as const;

export const GAME_COMBO_SOUND_ASSETS = Array.from(
  { length: 7 },
  (_, index) => `${GAME_AUDIO_ROOT}/combo-${index + 2}.mp3`
);

export type GameSound = keyof typeof GAME_SOUND_ASSETS | 'combo';

const SOUND_VOLUMES: Record<GameSound, number> = {
  challengeComplete: 0.68,
  combo: 0.58,
  comboClear: 0.62,
  gameOver: 0.58,
  gameStart: 0.52,
  invalidMove: 0.42,
  lineClear: 0.58,
  multiLineClear: 0.68,
  place: 0.42,
  uiTap: 0.44,
};

function getSoundAsset(sound: GameSound, comboLevel: number) {
  if (sound !== 'combo') return GAME_SOUND_ASSETS[sound];
  const comboIndex = Math.max(
    0,
    Math.min(GAME_COMBO_SOUND_ASSETS.length - 1, comboLevel - 2)
  );
  return GAME_COMBO_SOUND_ASSETS[comboIndex];
}

export function getLineClearSound(lineCount: number): GameSound | null {
  if (lineCount <= 0) return null;
  if (lineCount === 1) return 'lineClear';
  if (lineCount === 2) return 'comboClear';
  return 'multiLineClear';
}

export function useGameAudio({
  musicEnabled,
  soundEnabled,
}: {
  musicEnabled: boolean;
  soundEnabled: boolean;
}) {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const soundTemplatesRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    const music = new Audio(GAME_MUSIC_ASSET);
    music.loop = true;
    music.preload = 'auto';
    music.volume = 0.18;
    musicRef.current = music;

    const assets = [
      ...Object.values(GAME_SOUND_ASSETS),
      ...GAME_COMBO_SOUND_ASSETS,
    ];
    for (const asset of assets) {
      const audio = new Audio(asset);
      audio.preload = 'auto';
      soundTemplatesRef.current.set(asset, audio);
    }

    return () => {
      music.pause();
      music.currentTime = 0;
      musicRef.current = null;
      soundTemplatesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!musicEnabled) {
      musicRef.current?.pause();
    }
  }, [musicEnabled]);

  const playSound = useCallback(
    (sound: GameSound, comboLevel = 0) => {
      if (!soundEnabled || typeof window === 'undefined') return;

      const asset = getSoundAsset(sound, comboLevel);
      const template = soundTemplatesRef.current.get(asset);
      const audio = template
        ? (template.cloneNode() as HTMLAudioElement)
        : new Audio(asset);
      audio.volume = SOUND_VOLUMES[sound];
      void audio.play().catch(() => undefined);
    },
    [soundEnabled]
  );

  const startMusic = useCallback(() => {
    if (!musicEnabled || typeof window === 'undefined') return;
    const music = musicRef.current;
    if (!music) return;
    void music.play().catch(() => undefined);
  }, [musicEnabled]);

  const stopMusic = useCallback((rewind = false) => {
    const music = musicRef.current;
    if (!music) return;
    music.pause();
    if (rewind) music.currentTime = 0;
  }, []);

  return { playSound, startMusic, stopMusic };
}
