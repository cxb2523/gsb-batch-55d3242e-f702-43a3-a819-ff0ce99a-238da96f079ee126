import {
  IconArrowLeft,
  IconAlertTriangle,
  IconCrown,
  IconFlag,
  IconHome,
  IconPuzzle,
  IconRefresh,
  IconStar,
  IconTrophy,
} from '@tabler/icons-react';
import {
  type ShouldBlockFn,
  useBlocker,
  useNavigate,
} from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getLineClearSound, useGameAudio } from '@/components/game/game-audio';
import {
  CLEAR_EFFECT_DURATION,
  GameBoardView,
  type GameClearEffect,
} from '@/components/game/game-board-view';
import { GAME_COPY, type GameCopy } from '@/components/game/game-copy';
import {
  createGameRound,
  type GameRound,
  placeGamePiece,
} from '@/components/game/game-engine';
import { GAME_MODE_TARGETS } from '@/components/game/game-mode-config';
import { GameMenu } from '@/components/game/game-menu';
import { useGamePreferences } from '@/components/game/game-preferences';
import {
  clearActiveGameSession,
  readActiveGameSession,
  writeActiveGameSession,
} from '@/components/game/game-session';
import {
  BEST_SCORE_KEY,
  ensureScoreStorageVersion,
  getLocalDateKey,
  type GameMode,
  readBestScore,
  readScoreHistory,
  SCORE_HISTORY_KEY,
  type ScoreRecord,
} from '@/components/game/game-storage';
import { triggerHapticFeedback } from '@/lib/haptics';

const DEFAULT_BEST_SCORE = 0;

const CELEBRATION_COLORS = [
  '#ffcf32',
  '#ff5d73',
  '#5fd6ff',
  '#6ee7a5',
  '#a978ff',
  '#ff8a3d',
] as const;

const CHALLENGE_CONFETTI = Array.from({ length: 28 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const lane = Math.floor(index / 2);
  const distance = 52 + ((lane * 31) % 104);
  return {
    color: CELEBRATION_COLORS[index % CELEBRATION_COLORS.length],
    delay: (index % 7) * 45 + Math.floor(index / 14) * 120,
    endX: side * (distance + 24),
    id: index,
    lift: 104 + ((lane * 37) % 96),
    origin: side < 0 ? '28%' : '72%',
    peakX: side * distance,
    rotation: side * (260 + ((lane * 47) % 400)),
  };
});

function joinClasses(...values: Array<string | false | null>) {
  return values.filter(Boolean).join(' ');
}

function getModeLabel(copy: GameCopy, mode: GameMode) {
  return mode === 'classic' ? copy.classic : copy.daily;
}

export function BlockPuzzleGame({ routeMode }: { routeMode?: GameMode } = {}) {
  const navigate = useNavigate();
  const { isHydrated, preferences } = useGamePreferences();
  const [screen, setScreen] = useState<'game' | 'menu'>(
    routeMode ? 'game' : 'menu'
  );
  const [mode, setMode] = useState<GameMode>(routeMode ?? 'classic');
  const [round, setRound] = useState<GameRound>(() =>
    createGameRound('classic', getLocalDateKey())
  );
  const [bestScore, setBestScore] = useState(DEFAULT_BEST_SCORE);
  const [gameOver, setGameOver] = useState(false);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [clearEffect, setClearEffect] = useState<GameClearEffect | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [, setScoreHistory] = useState<ScoreRecord[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const dailyDateRef = useRef<string | null>(null);
  const clearEffectIdRef = useRef(0);
  const clearEffectTimerRef = useRef<number | null>(null);
  const isResolvingRef = useRef(false);
  const isReturningHomeRef = useRef(false);
  const { board, pieces, score } = round;
  const copy = GAME_COPY[preferences.language];
  const { playSound, startMusic, stopMusic } = useGameAudio({
    musicEnabled: preferences.music,
    soundEnabled: preferences.sound,
  });
  const shouldBlockGameNavigation = useCallback<ShouldBlockFn>(
    ({ next }) => next.pathname !== '/settings',
    []
  );
  const hasActiveGame = score > 0;
  const navigationBlocker = useBlocker({
    shouldBlockFn: shouldBlockGameNavigation,
    disabled:
      routeMode === undefined ||
      !isSessionReady ||
      screen !== 'game' ||
      !hasActiveGame ||
      gameOver ||
      challengeComplete,
    enableBeforeUnload: true,
    withResolver: true,
  });
  const isExitConfirmationOpen =
    exitConfirmationOpen || navigationBlocker.status === 'blocked';

  useEffect(() => {
    try {
      ensureScoreStorageVersion();
      setBestScore(readBestScore());
      setScoreHistory(readScoreHistory());
    } catch {
      // The game remains fully playable when storage is unavailable.
    }
  }, []);

  useEffect(
    () => () => {
      if (clearEffectTimerRef.current !== null) {
        window.clearTimeout(clearEffectTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const today = getLocalDateKey();
    const activeSession = readActiveGameSession(today);

    if (routeMode === undefined) {
      setScreen('menu');
      setIsSessionReady(true);
      if (activeSession) {
        void navigate({
          to: '/play/$mode',
          params: { mode: activeSession.mode },
          replace: true,
        });
      }
      return;
    }

    if (activeSession?.mode === routeMode) {
      setMode(activeSession.mode);
      setRound({
        board: activeSession.board,
        combo: activeSession.combo,
        generation: activeSession.generation,
        movesWithoutClear: activeSession.movesWithoutClear,
        pieces: activeSession.pieces,
        score: activeSession.score,
        seed: activeSession.seed,
      });
      setElapsedSeconds(activeSession.elapsedSeconds);
      setGameOver(activeSession.gameOver);
      setChallengeComplete(activeSession.challengeComplete);
      dailyDateRef.current = activeSession.dailyDate;
    } else {
      clearActiveGameSession();
      const dailyDate = routeMode === 'daily' ? today : null;
      dailyDateRef.current = dailyDate;
      setMode(routeMode);
      setRound(createGameRound(routeMode, dailyDate ?? today));
      setElapsedSeconds(0);
      setGameOver(false);
      setChallengeComplete(false);
    }

    setExitConfirmationOpen(false);
    setClearEffect(null);
    setScreen('game');
    setIsSessionReady(true);
  }, [navigate, routeMode]);

  const persistActiveGame = useCallback(() => {
    if (isReturningHomeRef.current || !isSessionReady || screen !== 'game') {
      return;
    }
    if (!hasActiveGame) {
      clearActiveGameSession();
      return;
    }
    writeActiveGameSession({
      board,
      challengeComplete,
      combo: round.combo,
      dailyDate: dailyDateRef.current,
      elapsedSeconds,
      gameOver,
      generation: round.generation,
      mode,
      movesWithoutClear: round.movesWithoutClear,
      pieces,
      score,
      seed: round.seed,
      version: 4,
    });
  }, [
    board,
    challengeComplete,
    elapsedSeconds,
    gameOver,
    hasActiveGame,
    isSessionReady,
    mode,
    round,
    screen,
  ]);

  useEffect(() => {
    persistActiveGame();
  }, [persistActiveGame]);

  useEffect(() => {
    if (
      screen !== 'game' ||
      gameOver ||
      challengeComplete ||
      isExitConfirmationOpen
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [challengeComplete, gameOver, isExitConfirmationOpen, screen]);

  useEffect(() => {
    if (screen !== 'game' || gameOver || challengeComplete) {
      stopMusic();
      return;
    }
    startMusic();
  }, [challengeComplete, gameOver, screen, startMusic, stopMusic]);

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (preferences.haptics) triggerHapticFeedback(pattern);
    },
    [preferences.haptics]
  );

  const dismissClearEffect = useCallback(() => {
    if (clearEffectTimerRef.current !== null) {
      window.clearTimeout(clearEffectTimerRef.current);
      clearEffectTimerRef.current = null;
    }
    isResolvingRef.current = false;
    setClearEffect(null);
  }, []);

  const recordScore = useCallback((finalScore: number, finalMode: GameMode) => {
    if (finalScore <= 0) return;

    setScoreHistory((current) => {
      const nextHistory = [
        ...current,
        {
          id: `${Date.now()}-${finalMode}-${finalScore}`,
          mode: finalMode,
          score: finalScore,
        },
      ]
        .sort((left, right) => right.score - left.score)
        .slice(0, 10);

      try {
        window.localStorage.setItem(
          SCORE_HISTORY_KEY,
          JSON.stringify(nextHistory)
        );
      } catch {
        // Keep the in-memory score history when storage is unavailable.
      }
      return nextHistory;
    });
  }, []);

  const finishGame = useCallback(
    (finalScore: number) => {
      const nextBest = Math.max(bestScore, finalScore);
      setBestScore(nextBest);
      setGameOver(true);
      recordScore(finalScore, mode);
      stopMusic();
      playSound('gameOver');
      vibrate([50, 40, 90]);

      try {
        window.localStorage.setItem(BEST_SCORE_KEY, String(nextBest));
      } catch {
        // Keep the in-memory best score when storage is unavailable.
      }
    },
    [bestScore, mode, playSound, recordScore, stopMusic, vibrate]
  );

  const placePiece = useCallback(
    (pieceIndex: number, row: number, column: number) => {
      if (isResolvingRef.current) return false;
      const resolution = gameOver
        ? null
        : placeGamePiece(round, { column, pieceIndex, row });
      if (!resolution) {
        playSound('invalidMove');
        vibrate(20);
        return false;
      }

      const {
        clear,
        earned,
        gameOver: nextGameOver,
        round: nextRound,
      } = resolution;
      const lineCount = clear?.lineCount ?? 0;
      if (clear) {
        clearEffectIdRef.current += 1;
        const effectId = clearEffectIdRef.current;
        isResolvingRef.current = true;
        setClearEffect({
          ...clear,
          comboLevel: nextRound.combo,
          earned,
          id: effectId,
        });

        if (clearEffectTimerRef.current !== null) {
          window.clearTimeout(clearEffectTimerRef.current);
        }
        clearEffectTimerRef.current = window.setTimeout(
          () => {
            setClearEffect((current) =>
              current?.id === effectId ? null : current
            );
            isResolvingRef.current = false;
            clearEffectTimerRef.current = null;
          },
          preferences.reducedMotion ? 30 : CLEAR_EFFECT_DURATION
        );
      }

      setRound(nextRound);
      if (nextRound.score > bestScore) {
        setBestScore(nextRound.score);
        try {
          window.localStorage.setItem(BEST_SCORE_KEY, String(nextRound.score));
        } catch {
          // Keep the in-memory best score when storage is unavailable.
        }
      }
      playSound('place');
      const clearSound = getLineClearSound(lineCount);
      if (clearSound) playSound(clearSound);
      if (lineCount > 0 && nextRound.combo >= 2) {
        playSound('combo', nextRound.combo);
      }
      vibrate(lineCount > 0 ? [20, 30, 35] : 12);

      const target = GAME_MODE_TARGETS[mode];
      if (target !== null && nextRound.score >= target) {
        const completeChallenge = () => {
          setChallengeComplete(true);
          recordScore(nextRound.score, mode);
          stopMusic();
          playSound('challengeComplete');
        };
        if (lineCount > 0 && !preferences.reducedMotion) {
          window.setTimeout(completeChallenge, CLEAR_EFFECT_DURATION);
        } else {
          completeChallenge();
        }
        return true;
      }

      if (nextGameOver) {
        window.setTimeout(
          () => finishGame(nextRound.score),
          lineCount > 0 && !preferences.reducedMotion
            ? CLEAR_EFFECT_DURATION
            : 220
        );
      }
      return true;
    },
    [
      bestScore,
      finishGame,
      gameOver,
      mode,
      playSound,
      preferences.reducedMotion,
      recordScore,
      round,
      stopMusic,
      vibrate,
    ]
  );

  const restartGame = useCallback(() => {
    isReturningHomeRef.current = false;
    dismissClearEffect();
    const dailyDate = mode === 'daily' ? getLocalDateKey() : null;
    dailyDateRef.current = dailyDate;
    setRound(createGameRound(mode, dailyDate ?? getLocalDateKey()));
    setElapsedSeconds(0);
    setGameOver(false);
    setChallengeComplete(false);
    setExitConfirmationOpen(false);
    startMusic();
    playSound('gameStart');
  }, [dismissClearEffect, mode, playSound, startMusic]);

  const returnToMenu = useCallback(() => {
    isReturningHomeRef.current = true;
    dismissClearEffect();
    clearActiveGameSession();
    dailyDateRef.current = null;
    setChallengeComplete(false);
    setGameOver(false);
    setExitConfirmationOpen(false);
    setScreen('menu');
    stopMusic(true);
    if (navigationBlocker.status === 'blocked') {
      navigationBlocker.proceed();
      return;
    }
    void navigate({ to: '/', ignoreBlocker: true });
  }, [dismissClearEffect, navigate, navigationBlocker, stopMusic]);

  const keepPlaying = useCallback(() => {
    setExitConfirmationOpen(false);
    if (navigationBlocker.status === 'blocked') {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  const requestExit = useCallback(() => {
    if (hasActiveGame) {
      setExitConfirmationOpen(true);
      return;
    }
    returnToMenu();
  }, [hasActiveGame, returnToMenu]);

  const gameClassName = joinClasses(
    'block-game',
    preferences.reducedMotion && 'reduce-game-motion'
  );
  const challengeFailed = gameOver && mode === 'daily';

  if (screen === 'menu') {
    return (
      <div
        className={gameClassName}
        data-ready={isHydrated && isSessionReady}
        data-testid="block-game"
      >
        <div className="game-backdrop" aria-hidden="true">
          <span className="backdrop-block backdrop-block-one" />
          <span className="backdrop-block backdrop-block-two" />
          <span className="backdrop-block backdrop-block-three" />
          <span className="backdrop-block backdrop-block-four" />
        </div>
        <GameMenu bestScore={bestScore} copy={copy} />
      </div>
    );
  }

  return (
    <div
      className={gameClassName}
      data-ready={isHydrated && isSessionReady}
      data-testid="block-game"
    >
      <div className="game-backdrop" aria-hidden="true">
        <span className="backdrop-block backdrop-block-one" />
        <span className="backdrop-block backdrop-block-two" />
        <span className="backdrop-block backdrop-block-three" />
        <span className="backdrop-block backdrop-block-four" />
      </div>

      <GameBoardView
        clearEffect={clearEffect}
        copy={copy}
        gameOver={gameOver}
        hintsEnabled={preferences.hints}
        mode={mode}
        onPersist={persistActiveGame}
        onPlace={placePiece}
        onRequestExit={requestExit}
        round={round}
      />

      {isExitConfirmationOpen && !gameOver && !challengeComplete && (
        <div className="game-modal-backdrop">
          <section
            className="game-modal exit-confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-game-title"
          >
            <IconAlertTriangle className="modal-hero-icon" aria-hidden="true" />
            <h2 id="exit-game-title">{copy.exitGameTitle}</h2>
            <p>{copy.exitGameDescription}</p>
            <button
              type="button"
              className="restart-button"
              onClick={keepPlaying}
            >
              <IconPuzzle aria-hidden="true" />
              {copy.keepPlaying}
            </button>
            <button
              type="button"
              className="restart-button exit-game-button"
              onClick={returnToMenu}
            >
              <IconArrowLeft aria-hidden="true" />
              {copy.confirmExit}
            </button>
          </section>
        </div>
      )}

      {gameOver && (
        <div className="game-modal-backdrop">
          <section
            className={joinClasses(
              'game-modal game-over-modal',
              challengeFailed && 'challenge-failed-modal'
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-over-title"
          >
            {challengeFailed ? (
              <IconFlag className="modal-hero-icon" aria-hidden="true" />
            ) : (
              <IconTrophy className="modal-hero-icon" aria-hidden="true" />
            )}
            <h2 id="game-over-title">
              {challengeFailed ? copy.challengeFailed : copy.greatGame}
            </h2>
            <p>
              {challengeFailed
                ? copy.challengeFailedDescription(GAME_MODE_TARGETS[mode] ?? 0)
                : copy.gameOverDescription}
            </p>
            <div className="final-score">
              <span>{copy.yourScore}</span>
              <strong>{score}</strong>
            </div>
            <div className="final-best">
              {challengeFailed ? (
                <>
                  <IconFlag aria-hidden="true" /> {copy.goal}{' '}
                  {GAME_MODE_TARGETS[mode]}
                </>
              ) : (
                <>
                  <IconCrown aria-hidden="true" /> {copy.yourBest} {bestScore}
                </>
              )}
            </div>
            <button
              type="button"
              className="restart-button"
              onClick={restartGame}
            >
              <IconRefresh aria-hidden="true" />
              {copy.playAgain}
            </button>
            <button
              type="button"
              className="restart-button result-home-button"
              onClick={returnToMenu}
            >
              <IconHome aria-hidden="true" />
              {copy.backHome}
            </button>
          </section>
        </div>
      )}

      {challengeComplete && (
        <div className="game-modal-backdrop">
          <section
            className="game-modal game-over-modal challenge-complete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenge-complete-title"
          >
            <div className="celebration-confetti" aria-hidden="true">
              {CHALLENGE_CONFETTI.map((piece) => (
                <span
                  className="confetti-piece"
                  key={piece.id}
                  style={
                    {
                      '--confetti-color': piece.color,
                      '--confetti-delay': `${piece.delay}ms`,
                      '--confetti-end-x': `${piece.endX}px`,
                      '--confetti-lift': `${piece.lift}px`,
                      '--confetti-origin': piece.origin,
                      '--confetti-peak-x': `${piece.peakX}px`,
                      '--confetti-rotation': `${piece.rotation}deg`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <IconStar className="modal-hero-icon" aria-hidden="true" />
            <h2 id="challenge-complete-title">{copy.challengeComplete}</h2>
            <p>
              {copy.challengeCompleteDescription(GAME_MODE_TARGETS[mode] ?? 0)}
            </p>
            <div className="final-score">
              <span>{copy.yourScore}</span>
              <strong>{score}</strong>
            </div>
            <div className="final-best">
              <IconFlag aria-hidden="true" />
              {getModeLabel(copy, mode)}
            </div>
            <button
              type="button"
              className="restart-button challenge-home-button"
              onClick={() => {
                setChallengeComplete(false);
                returnToMenu();
              }}
            >
              <IconHome aria-hidden="true" />
              {copy.backHome}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
