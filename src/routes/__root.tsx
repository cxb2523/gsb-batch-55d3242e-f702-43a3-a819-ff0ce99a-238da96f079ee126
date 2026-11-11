import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import '@fontsource/lilita-one/400.css';
import gameCss from '../game.css?url';
import { GamePreferencesProvider } from '@/components/game/game-preferences';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no',
      },
      { title: 'Super Blocks' },
      {
        name: 'description',
        content: 'A relaxing browser-based block puzzle game.',
      },
      { name: 'theme-color', content: '#4865c5' },
      { property: 'og:image', content: '/og.png' },
    ],
    links: [
      { rel: 'stylesheet', href: gameCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFoundPage,
});

function RootComponent() {
  return (
    <GamePreferencesProvider>
      <main id="main-content" className="game-shell-main">
        <Outlet />
      </main>
    </GamePreferencesProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <section className="block-game">
      <div className="game-stage">
        <main className="game-page-card">
          <h1>Page not found</h1>
          <Link className="game-primary-link" to="/">
            Back to Super Blocks
          </Link>
        </main>
      </div>
    </section>
  );
}
