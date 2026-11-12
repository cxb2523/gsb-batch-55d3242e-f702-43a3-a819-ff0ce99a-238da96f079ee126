import { Howl } from "howler";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { checkAudioPermission, claimSound, freeSound, isSoundEnabled, preloadSounds, SoundName, unlockAudioContext } from "./runtime";
import { SoundHookReturn, SoundOptions } from "./types";

interface SoundContextType {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

// We'll get the actual context from components.tsx when using it
type SoundContextValue = React.Context<SoundContextType | null>;

// This will be set by SoundProvider from components.tsx
let SoundContext: SoundContextValue;

// Function to set the context from components.tsx
export function setSoundContext(context: SoundContextValue): void {
  SoundContext = context;
}

/**
 * Hook for using a sound in a React component.
 * Will use local bundled sounds if available before falling back to remote.
 */
export function useSound(soundName: SoundName, defaultOptions: SoundOptions = {}): SoundHookReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Howl | null>(null);
  // Each entry tracks one concrete playback (Howler sound id). `paused` lets us
  // distinguish instances that were paused from ones that already ended and
  // therefore must not be replayed on resume().
  const activeSoundsRef = useRef<Array<{ id: number; loop: boolean; paused: boolean; resolver?: () => void }>>([]);
  // Prevent re-registering an "end" listener when the same cached Howl instance
  // is claimed again after being released.
  const listenedHowlsRef = useRef<WeakSet<Howl>>(new WeakSet());

  // Get sound enabled state from context if available, fall back to global state
  let enabled = isSoundEnabled();
  try {
    const soundContext = SoundContext ? useContext(SoundContext) : null;
    if (soundContext) enabled = soundContext.enabled;
  } catch (_e) { /* SoundContext may not be available */ }

  // Keep the latest value available inside async callbacks so that enabling/
  // disabling sounds while a promise is in flight takes effect immediately.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Lazy loading approach - only load the sound when needed
  const ensureLoaded = useCallback(async (): Promise<Howl> => {
    if (soundRef.current) return soundRef.current;

    try {
      const howl = await claimSound(soundName);

      // Set up event listeners once per Howl instance (the instance is shared
      // between hook consumers, so each consumer needs its own listener).
      if (!listenedHowlsRef.current.has(howl)) {
        listenedHowlsRef.current.add(howl);

        howl.on("end", (id) => {
          const soundIndex = activeSoundsRef.current.findIndex((sound) => sound.id === id);
          if (soundIndex < 0) return;

          const sound = activeSoundsRef.current[soundIndex];
          activeSoundsRef.current.splice(soundIndex, 1);

          if (sound.resolver) sound.resolver(); // Resolve sound (eg. created in play())

          // A looped instance that has ended (or stopped) must be forgotten so
          // resume() never revives it. Any remaining playing instance keeps
          // isPlaying true.
          setIsPlaying(activeSoundsRef.current.some((active) => !active.paused));

          if (activeSoundsRef.current.length === 0) {
            soundRef.current = freeSound(soundName);
          }
        });
      }

      soundRef.current = howl;
      setIsLoaded(true);
      return howl;
    } catch (error) {
      console.error("Error loading sound:", error);
      throw error;
    }
  }, [soundName, setIsPlaying]);

  const play = useCallback(
    async (options: SoundOptions = defaultOptions) => {
      if (!enabled) return;

      try {
        // Ensure audio context is unlocked before playing
        await unlockAudioContext();

        // Sounds may have been disabled while unlocking the audio context.
        if (!enabledRef.current) return;

        // Ensure the sound is loaded
        const howl = await ensureLoaded();

        // Sounds may also have been disabled while the sound was loading.
        if (!enabledRef.current) return;

        const loop = options.loop !== undefined ? options.loop : false;
        if (options.volume !== undefined) howl.volume(options.volume);
        if (options.rate !== undefined) howl.rate(options.rate);
        howl.loop(loop);

        const id = howl.play();
        setIsPlaying(true);

        if (loop) {
          // For looped sounds, we just track them but don't resolve
          activeSoundsRef.current.push({ id, loop, paused: false });
          return;
        }

        // For non-looped sounds, return a promise that resolves when the sound ends
        return new Promise<void>((resolve) => {
          activeSoundsRef.current.push({ id, loop, paused: false, resolver: () => resolve() });
        });
      } catch (error) {
        console.error("Error playing sound:", error);
        throw error;
      }
    },
    // isLoaded is a required dep for handling changed sound name
    [defaultOptions, enabled, ensureLoaded, isLoaded]
  );

  const stop = useCallback(() => {
    const howl = soundRef.current;

    // Resolve any pending promises, even if the Howl was already released
    // (for example by the "end" handler), and clear all active records.
    activeSoundsRef.current.forEach((sound) => {
      if (sound.resolver) sound.resolver();
    });
    activeSoundsRef.current = [];

    setIsPlaying(false);

    if (!howl) return;

    howl.stop();
    soundRef.current = freeSound(soundName);
  }, [soundName]);

  const pause = useCallback(() => {
    if (!soundRef.current) return;

    soundRef.current.pause();
    // Mark every live instance as paused so resume() replays exactly these
    // instances (and never instances that have already ended).
    activeSoundsRef.current.forEach((sound) => {
      sound.paused = true;
    });
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (!enabledRef.current || !soundRef.current) return;

    const howl = soundRef.current;
    const pausedSounds = activeSoundsRef.current.filter((sound) => sound.paused);
    if (pausedSounds.length === 0) return;

    // Try to unlock audio context before resuming
    unlockAudioContext().then(() => {
      // Sounds may have been disabled, stopped, or unmounted while unlocking.
      if (!enabledRef.current || soundRef.current !== howl) return;

      let resumedCount = 0;
      pausedSounds.forEach((sound) => {
        // Skip instances that were removed while we were waiting.
        if (!sound.paused || !activeSoundsRef.current.includes(sound)) return;

        howl.play(sound.id);
        sound.paused = false;
        resumedCount += 1;
      });

      if (resumedCount > 0) setIsPlaying(true);
    });
  }, []);

  useEffect(() => {
    if (!enabled && isPlaying) pause(); // Pause all sounds when disabled
  }, [enabled, isPlaying, pause]);

  // Cleanup on unmount
  useEffect(() => {
    let cancelled = false;
    preloadSounds([soundName]).then(() => {
      if (!cancelled) setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      setIsLoaded(false);
      setIsPlaying(false);

      const howl = soundRef.current;
      activeSoundsRef.current.forEach((sound) => {
        if (sound.resolver) sound.resolver(); // Resolve any pending promises
      });
      activeSoundsRef.current = [];

      if (howl) {
        howl.stop();
        soundRef.current = freeSound(soundName);
      }
    };
  }, [soundName]);

  const checkPermission = useCallback(() => checkAudioPermission(), []);

  return { play, stop, pause, resume, isPlaying, isLoaded, checkPermission };
}

interface UseSoundOnChangeOptions extends SoundOptions {
  initial?: boolean;
}

/**
 * Hook for playing a sound when a value changes
 */
export function useSoundOnChange<T>(soundName: SoundName, value: T, options?: UseSoundOnChangeOptions): void {
  const { play } = useSound(soundName);
  const initialRef = useRef(true);

  useEffect(() => {
    const skipThisInitialRun = initialRef.current && options?.initial === false;
    initialRef.current = false;
    if (skipThisInitialRun) return;

    play(options).catch((err) => console.error("Failed to play sound:", err));
  }, [value]);
}

/**
 * Hook for accessing and controlling the sound enabled state
 */
export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const context = useContext(SoundContext);
  if (!context) throw new Error("useSoundEnabled must be used within a SoundProvider");

  return [context.enabled, context.setEnabled];
}
