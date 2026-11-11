import { IconArrowLeft, IconBook2, IconChartBar } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { GAME_COPY } from '@/components/game/game-copy';
import { GamePageFrame } from '@/components/game/game-page-frame';
import { useGamePreferences } from '@/components/game/game-preferences';

export function HowToPlayPage() {
  const { preferences } = useGamePreferences();
  const copy = GAME_COPY[preferences.language];
  const scoreRules = [
    copy.placementPoints,
    copy.clearBonus,
    copy.multiLineBonus,
    copy.sixPlusLineBonus,
    copy.comboBonus,
  ];

  return (
    <GamePageFrame testId="how-to-play-page">
      <main className="game-inner-shell">
        <header className="game-inner-header">
          <Link aria-label={copy.backToHome} className="game-round-link" to="/">
            <IconArrowLeft aria-hidden="true" />
          </Link>
          <h1>{copy.howToPlay}</h1>
          <IconBook2 className="game-inner-header-icon" aria-hidden="true" />
        </header>

        <section className="game-settings-section guide-section">
          <div className="game-settings-title">
            <IconBook2 aria-hidden="true" />
            <h2>{copy.rules}</h2>
          </div>
          <ol className="rules-steps">
            {copy.howToPlaySteps.map((step, index) => (
              <li key={step}>
                <span className="leaderboard-position">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="game-settings-section guide-section">
          <div className="game-settings-title">
            <IconChartBar aria-hidden="true" />
            <h2>{copy.scoreRules}</h2>
          </div>
          <ul className="score-rules">
            {scoreRules.map((rule) => {
              return (
                <li key={rule}>
                  <span>
                    {rule
                      .split(/(\+\d+|×\d+)/)
                      .map((part, index) =>
                        /^(\+\d+|×\d+)$/.test(part) ? (
                          <strong key={`${part}-${index}`}>{part}</strong>
                        ) : (
                          part
                        )
                      )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </GamePageFrame>
  );
}
