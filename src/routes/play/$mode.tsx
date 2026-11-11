import { createFileRoute, redirect } from '@tanstack/react-router';
import { BlockPuzzleGame } from '@/components/game/block-puzzle-game';
import { isGameMode } from '@/components/game/game-storage';

export const Route = createFileRoute('/play/$mode')({
  beforeLoad: ({ params }) => {
    if (!isGameMode(params.mode)) {
      throw redirect({ to: '/' });
    }
  },
  component: PlayModePage,
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.mode === 'daily' ? 'Daily' : 'Classic'} — Super Blocks`,
      },
    ],
  }),
});

function PlayModePage() {
  const { mode } = Route.useParams();
  return <BlockPuzzleGame routeMode={isGameMode(mode) ? mode : 'classic'} />;
}
