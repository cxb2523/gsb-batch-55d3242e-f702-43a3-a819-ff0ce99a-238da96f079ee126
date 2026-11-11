import { createFileRoute } from '@tanstack/react-router';
import { HowToPlayPage } from '@/components/game/how-to-play-page';

export const Route = createFileRoute('/how-to-play')({
  component: HowToPlayPage,
  head: () => ({ meta: [{ title: 'How to Play — Super Blocks' }] }),
});
