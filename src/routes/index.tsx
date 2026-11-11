import { createFileRoute } from '@tanstack/react-router';
import { BlockPuzzleGame } from '@/components/game/block-puzzle-game';

export const Route = createFileRoute('/')({
  component: BlockPuzzleGame,
});
