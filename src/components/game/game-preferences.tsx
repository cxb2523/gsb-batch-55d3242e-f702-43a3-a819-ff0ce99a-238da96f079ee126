import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { GameLanguage } from '@/components/game/game-copy';

export interface GamePreferences {
  haptics: boolean;
  hints: boolean;
  language: GameLanguage;
  music: boolean;
  reducedMotion: boolean;
  sound: boolean;
}

interface GamePreferencesContextValue {
  isHydrated: boolean;
  preferences: GamePreferences;
  resetPreferences: () => void;
  updatePreference: <Key extends keyof GamePreferences>(
    key: Key,
    value: GamePreferences[Key]
  ) => void;
}

const STORAGE_KEYS = {
  haptics: 'block-blast-haptics',
  hints: 'block-blast-hints',
  language: 'block-blast-language',
  music: 'block-blast-music',
  reducedMotion: 'block-blast-reduced-motion',
  sound: 'block-blast-sound',
} as const;

function createDefaultPreferences(): GamePreferences {
  return {
    haptics: true,
    hints: true,
    language: 'en',
    music: true,
    reducedMotion: false,
    sound: true,
  };
}

const GamePreferencesContext =
  createContext<GamePreferencesContextValue | null>(null);

export function GamePreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(createDefaultPreferences);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedLanguage = window.localStorage.getItem(STORAGE_KEYS.language);
      setPreferences({
        haptics: window.localStorage.getItem(STORAGE_KEYS.haptics) !== 'false',
        hints: window.localStorage.getItem(STORAGE_KEYS.hints) !== 'false',
        language:
          storedLanguage === 'zh' || storedLanguage === 'en'
            ? storedLanguage
            : navigator.language.toLowerCase().startsWith('zh')
              ? 'zh'
              : 'en',
        music: window.localStorage.getItem(STORAGE_KEYS.music) !== 'false',
        reducedMotion:
          window.localStorage.getItem(STORAGE_KEYS.reducedMotion) === 'true',
        sound: window.localStorage.getItem(STORAGE_KEYS.sound) !== 'false',
      });
    } catch {
      // Defaults keep the game usable when browser storage is unavailable.
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Keep the document language in sync so assistive technology and search
    // engines see the interface language the player actually selected.
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  const value = useMemo<GamePreferencesContextValue>(
    () => ({
      isHydrated,
      preferences,
      resetPreferences: () => {
        const defaults = createDefaultPreferences();
        setPreferences(defaults);
        try {
          for (const key of Object.values(STORAGE_KEYS)) {
            window.localStorage.removeItem(key);
          }
        } catch {
          // Keep the in-memory defaults when storage is unavailable.
        }
      },
      updatePreference: (key, nextValue) => {
        setPreferences((current) => ({ ...current, [key]: nextValue }));
        try {
          if (nextValue === null) {
            window.localStorage.removeItem(STORAGE_KEYS[key]);
          } else {
            window.localStorage.setItem(STORAGE_KEYS[key], String(nextValue));
          }
        } catch {
          // Keep the in-memory preference when storage is unavailable.
        }
      },
    }),
    [isHydrated, preferences]
  );

  return (
    <GamePreferencesContext.Provider value={value}>
      {children}
    </GamePreferencesContext.Provider>
  );
}

export function useGamePreferences() {
  const context = useContext(GamePreferencesContext);
  if (!context) {
    throw new Error(
      'useGamePreferences must be used inside GamePreferencesProvider'
    );
  }
  return context;
}
