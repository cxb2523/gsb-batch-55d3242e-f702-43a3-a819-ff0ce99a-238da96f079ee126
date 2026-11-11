import { createFileRoute } from '@tanstack/react-router';
import { GameSettingsPage } from '@/components/game/game-settings-page';

export const Route = createFileRoute('/settings')({
  component: GameSettingsPage,
  head: () => ({ meta: [{ title: 'Settings — Super Blocks' }] }),
});
