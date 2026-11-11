import type { ReactNode } from 'react';
import { useGamePreferences } from '@/components/game/game-preferences';

export function GamePageFrame({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  const { isHydrated, preferences } = useGamePreferences();
  const className = [
    'block-game',
    'game-inner-page',
    preferences.reducedMotion ? 'reduce-game-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} data-ready={isHydrated} data-testid={testId}>
      <div className="game-backdrop" aria-hidden="true">
        <span className="backdrop-block backdrop-block-one" />
        <span className="backdrop-block backdrop-block-two" />
        <span className="backdrop-block backdrop-block-three" />
        <span className="backdrop-block backdrop-block-four" />
      </div>
      {children}
    </div>
  );
}
