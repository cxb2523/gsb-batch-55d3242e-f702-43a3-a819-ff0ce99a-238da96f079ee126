import {
  IconBook2,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconCrown,
  IconPuzzle,
  IconSettings,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import type { GameCopy } from '@/components/game/game-copy';

function SuperBlocksLogo() {
  const words = ['Super', 'Blocks'] as const;

  return (
    <div className="game-logo" role="img" aria-label="Super Blocks">
      <span className="game-logo-piece game-logo-piece-left" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {words.map((word) => (
        <span
          className={`game-logo-word game-logo-${word.toLowerCase()}`}
          aria-hidden="true"
          key={word}
        >
          {[...word].map((letter, index) => (
            <span
              className="game-logo-letter"
              key={`${word}-${letter}-${index}`}
              style={
                {
                  '--logo-letter-index': index,
                } as CSSProperties
              }
            >
              {letter}
            </span>
          ))}
        </span>
      ))}
      <span
        className="game-logo-piece game-logo-piece-right"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
      </span>
      <span
        className="game-logo-spark game-logo-spark-one"
        aria-hidden="true"
      />
      <span
        className="game-logo-spark game-logo-spark-two"
        aria-hidden="true"
      />
    </div>
  );
}

export function GameMenu({
  bestScore,
  copy,
}: {
  bestScore: number;
  copy: GameCopy;
}) {
  return (
    <section className="game-stage menu-stage" aria-label={copy.chooseMode}>
      <nav className="menu-topbar" aria-label={copy.rules}>
        <Link
          className="game-corner-link"
          data-testid="home-how-to-play"
          to="/how-to-play"
        >
          <IconBook2 aria-hidden="true" />
          <span>{copy.howToPlay}</span>
        </Link>
        <Link
          className="game-corner-link"
          data-testid="home-settings"
          to="/settings"
        >
          <IconSettings aria-hidden="true" />
          <span>{copy.settings}</span>
        </Link>
      </nav>

      <div className="menu-content">
        <div className="menu-hero">
          <SuperBlocksLogo />

          <output
            className="menu-best-score"
            aria-label={`${copy.bestScore} ${bestScore}`}
          >
            <IconCrown aria-hidden="true" />
            <span>{copy.bestScore}</span>
            <strong>{bestScore}</strong>
          </output>
        </div>

        <div className="mode-list">
          <Link
            className="mode-card mode-card-classic"
            data-testid="start-classic"
            params={{ mode: 'classic' }}
            to="/play/$mode"
          >
            <span className="mode-card-icon">
              <IconPuzzle aria-hidden="true" />
            </span>
            <span className="mode-card-copy">
              <strong>{copy.classic}</strong>
              <small>{copy.classicTagline}</small>
            </span>
            <IconChevronRight aria-hidden="true" />
          </Link>

          <Link
            className="mode-card mode-card-daily"
            data-testid="start-daily"
            params={{ mode: 'daily' }}
            to="/play/$mode"
          >
            <span className="mode-card-icon">
              <IconCalendarEvent aria-hidden="true" />
            </span>
            <span className="mode-card-copy">
              <strong>{copy.daily}</strong>
              <small>{copy.dailyTagline}</small>
            </span>
            <IconChevronRight aria-hidden="true" />
          </Link>
        </div>

        <Link
          className="ranking-home-button"
          data-testid="home-ranking"
          to="/ranking"
        >
          <span className="mode-card-icon ranking-card-icon">
            <IconChartBar aria-hidden="true" />
          </span>
          <span className="mode-card-copy">
            <strong>{copy.ranking}</strong>
            <small>{copy.rankingDescription}</small>
          </span>
          <IconChevronRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
