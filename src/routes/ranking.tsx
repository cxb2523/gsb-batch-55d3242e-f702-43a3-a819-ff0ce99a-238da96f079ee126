import { createFileRoute } from '@tanstack/react-router';
import { RankingPage } from '@/components/game/ranking-page';

export const Route = createFileRoute('/ranking')({
  component: RankingPage,
  head: () => ({ meta: [{ title: 'Best Scores — Super Blocks' }] }),
});
