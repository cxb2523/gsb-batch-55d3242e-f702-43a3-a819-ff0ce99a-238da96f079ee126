import { expect, test, type Page } from '@playwright/test';

const SESSION_KEY = 'block-blast-active-game';
const NOTICE_TEST_ID = 'daily-expired-notice';
const EN_NOTICE =
  "Yesterday's challenge has ended. A new board has been generated for today.";
const ZH_NOTICE = '昨日挑战已结束，今日棋盘已重新生成。';

/**
 * Loose shape of the sessionStorage payload the game writes. Tests mutate
 * copies of a real persisted object, so fields stay deliberately permissive
 * here; the application's own validator is what decides validity.
 */
interface PersistedSession {
  board: unknown[];
  dailyDate: string | null;
  mode: string;
  pieces: unknown[];
  score: unknown;
  [key: string]: unknown;
}

async function preparePage(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.addInitScript(() => {
    const audioWindow = window as Window & {
      __superBlocksAudioPlays?: string[];
    };
    audioWindow.__superBlocksAudioPlays = [];
    HTMLMediaElement.prototype.play = function play() {
      audioWindow.__superBlocksAudioPlays?.push(
        new URL(this.src, window.location.href).pathname
      );
      return Promise.resolve();
    };

    if (window.sessionStorage.getItem('block-blast-e2e-ready')) {
      return;
    }
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('block-blast-')) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.setItem('block-blast-language', 'en');
    window.localStorage.setItem('block-blast-score-version', '3');
    window.sessionStorage.removeItem('block-blast-active-game');
    window.sessionStorage.setItem('block-blast-e2e-ready', 'true');
  });

  return errors;
}

/**
 * Opens the daily challenge and places one piece, then returns the exact
 * payload the application itself persisted to sessionStorage. Mutating this
 * real-world payload keeps every test honest about the storage schema.
 */
async function createPersistedDailySession(page: Page) {
  await preparePage(page);
  await page.goto('/play/daily');
  await expect(page.getByTestId('block-game')).toHaveAttribute(
    'data-ready',
    'true'
  );
  await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveCount(0);

  await page.getByTestId('game-piece-2').click();
  await page.getByTestId('board-cell-0-0').click();
  await expect(page.getByTestId('game-score')).not.toHaveText('0');

  const stored = await page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as PersistedSession);
  }, SESSION_KEY);
  expect(stored).not.toBeNull();
  return stored as PersistedSession;
}

async function seedSession(page: Page, session: PersistedSession) {
  await page.evaluate(
    ([key, payload]) => {
      window.sessionStorage.setItem(key, JSON.stringify(payload));
    },
    [SESSION_KEY, session] as const
  );
}

/** Places a piece on the fresh board, retrying slots until a move lands. */
async function placeAnyPiece(page: Page) {
  const pieceCount = await page.locator('[data-testid^="game-piece-"]').count();
  for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
    await page.getByTestId(`game-piece-${pieceIndex}`).click();
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const cell = page.getByTestId(`board-cell-${row}-${column}`);
        await cell.click().catch(() => undefined);
        const score = await page.getByTestId('game-score').textContent();
        if (score && score !== '0') return;
      }
    }
  }
  throw new Error('Could not place any piece on the board');
}

test.describe('Daily challenge cross-day restore', () => {
  test('clears an expired daily session, starts today board, and shows the notice once', async ({
    page,
  }) => {
    const errors = await preparePage(page);
    const stored = await createPersistedDailySession(page);
    const todayKey = await page.evaluate(() => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });

    // Simulate the player returning after midnight: same well-formed save,
    // but its daily date no longer matches today.
    const expired = { ...stored, dailyDate: '2000-01-01' };
    await seedSession(page, expired);

    await page.goto('/play/daily');
    await expect(page.getByTestId('block-game')).toHaveAttribute(
      'data-ready',
      'true'
    );

    const notice = page.getByTestId(NOTICE_TEST_ID);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(EN_NOTICE);

    // The stale save must be gone from real sessionStorage.
    await expect
      .poll(() =>
        page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY)
      )
      .toBeNull();

    // The fresh daily board starts at score zero with a full piece tray.
    await expect(page.getByTestId('game-score')).toHaveText('0');
    await expect(page.locator('[data-testid^="game-piece-"]')).toHaveCount(3);

    // The notice disappears after the first successful placement.
    await placeAnyPiece(page);
    await expect(notice).toHaveCount(0);

    // It must not reappear on reload, and the new board keeps its progress.
    await page.reload();
    await expect(page.getByTestId('block-game')).toHaveAttribute(
      'data-ready',
      'true'
    );
    await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveCount(0);
    await expect(page.getByTestId('game-score')).not.toHaveText('0');
    const reloaded = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      SESSION_KEY
    );
    expect(reloaded.mode).toBe('daily');
    expect(reloaded.dailyDate).toBe(todayKey);
    expect(reloaded.dailyDate).not.toBe('2000-01-01');
    expect(errors).toEqual([]);
  });

  test('switches the cross-day notice copy with the stored language preference', async ({
    page,
  }) => {
    await preparePage(page);
    const stored = await createPersistedDailySession(page);
    await page.evaluate(() =>
      window.localStorage.setItem('block-blast-language', 'zh')
    );
    await seedSession(page, { ...stored, dailyDate: '2000-01-01' });

    await page.goto('/play/daily');
    await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveText(ZH_NOTICE);
  });

  for (const corruption of [
    {
      mutate: (session: PersistedSession) => ({
        ...session,
        board: session.board.slice(0, 7),
      }),
      label: 'board is not 8x8',
    },
    {
      mutate: (session: PersistedSession) => ({
        ...session,
        pieces: [session.pieces[0], session.pieces[1]],
      }),
      label: 'pieces length is not 3',
    },
    {
      mutate: (session: PersistedSession) => ({
        ...session,
        score: '120',
      }),
      label: 'field has the wrong type',
    },
  ] as const) {
    test(`silently discards a structurally invalid daily session (${corruption.label}) without the cross-day notice`, async ({
      page,
    }) => {
      const errors = await preparePage(page);
      const stored = await createPersistedDailySession(page);
      const corrupt = corruption.mutate(stored);
      await seedSession(page, corrupt);

      await page.goto('/play/daily');
      await expect(page.getByTestId('block-game')).toHaveAttribute(
        'data-ready',
        'true'
      );

      // Corrupt saves behave exactly as before: no notice, fresh board.
      await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveCount(0);
      await expect(page.getByTestId('game-score')).toHaveText('0');
      await expect(page.locator('[data-testid^="game-piece-"]')).toHaveCount(3);
      await expect
        .poll(() =>
          page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY)
        )
        .toBeNull();
      expect(errors).toEqual([]);
    });
  }

  test('restores a well-formed daily session for today without any notice', async ({
    page,
  }) => {
    const errors = await preparePage(page);
    const stored = await createPersistedDailySession(page);
    const previousScore = Number(stored.score);
    expect(previousScore).toBeGreaterThan(0);
    await seedSession(page, stored);

    await page.goto('/play/daily');
    await expect(page.getByTestId('block-game')).toHaveAttribute(
      'data-ready',
      'true'
    );

    await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveCount(0);
    await expect(page.getByTestId('game-score')).toHaveText(
      String(previousScore)
    );

    // The same payload round-trips through real sessionStorage on restore.
    const restored = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      SESSION_KEY
    );
    expect(restored.dailyDate).toBe(stored.dailyDate);
    expect(restored.board).toEqual(stored.board);
    expect(restored.pieces).toEqual(stored.pieces);
    expect(errors).toEqual([]);
  });

  test('never shows the cross-day notice for classic mode, even with a mismatched stored date', async ({
    page,
  }) => {
    const errors = await preparePage(page);
    const stored = await createPersistedDailySession(page);
    const classic = {
      ...stored,
      dailyDate: null,
      mode: 'classic',
    };
    await seedSession(page, classic);

    await page.goto('/play/classic');
    await expect(page.getByTestId('block-game')).toHaveAttribute(
      'data-ready',
      'true'
    );

    await expect(page.getByTestId(NOTICE_TEST_ID)).toHaveCount(0);
    await expect(page.getByTestId('game-score')).toHaveText(
      String(stored.score)
    );
    const restored = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      SESSION_KEY
    );
    expect(restored.mode).toBe('classic');
    expect(restored.dailyDate).toBeNull();
    expect(errors).toEqual([]);
  });
});
