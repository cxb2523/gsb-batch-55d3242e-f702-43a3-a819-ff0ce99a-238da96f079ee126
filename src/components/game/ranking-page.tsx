import {
  IconArrowLeft,
  IconCalendarEvent,
  IconCrown,
  IconInfinity,
  IconTrophy,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { GAME_COPY } from '@/components/game/game-copy';
import { GamePageFrame } from '@/components/game/game-page-frame';
import { useGamePreferences } from '@/components/game/game-preferences';
import {
  ensureScoreStorageVersion,
  readBestScore,
  readScoreHistory,
  type ScoreRecord,
} from '@/components/game/game-storage';

export function RankingPage() {
  const { preferences } = useGamePreferences();
  const [bestScore, setBestScore] = useState(0);
  const [history, setHistory] = useState<ScoreRecord[]>([]);
  const copy = GAME_COPY[preferences.language];
  const classicBest = getModeBest(history, 'classic');
  const dailyBest = getModeBest(history, 'daily');

  useEffect(() => {
    try {
      ensureScoreStorageVersion();
      setBestScore(readBestScore());
      setHistory(readScoreHistory());
    } catch {
      // Zero scores are a safe fallback when storage is unavailable.
    }
  }, []);

  return (
    <GamePageFrame testId="ranking-page">
      <main className="game-inner-shell">
        <header className="game-inner-header">
          <Link aria-label={copy.backToHome} className="game-round-link" to="/">
            <IconArrowLeft aria-hidden="true" />
          </Link>
          <h1>{copy.ranking}</h1>
          <IconTrophy
            className="game-inner-header-icon trophy"
            aria-hidden="true"
          />
        </header>

        <section className="score-summary" aria-label={copy.ranking}>
          <article className="ranking-best-card">
            <IconCrown aria-hidden="true" />
            <span>{copy.yourBest}</span>
            <strong>{bestScore.toLocaleString()}</strong>
          </article>

          <div className="mode-best-grid">
            <article className="mode-best-card">
              <IconInfinity aria-hidden="true" />
              <span>{copy.classic}</span>
              <strong>{classicBest.toLocaleString()}</strong>
            </article>
            <article className="mode-best-card">
              <IconCalendarEvent aria-hidden="true" />
              <span>{copy.daily}</span>
              <strong>{dailyBest.toLocaleString()}</strong>
            </article>
          </div>
        </section>
      </main>
    </GamePageFrame>
  );
}

function getModeBest(history: ScoreRecord[], mode: ScoreRecord['mode']) {
  return history.reduce(
    (best, entry) => (entry.mode === mode ? Math.max(best, entry.score) : best),
    0
  );
}
