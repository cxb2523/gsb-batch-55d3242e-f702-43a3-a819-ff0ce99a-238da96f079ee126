# E2E test catalog

## Super Blocks core journey

**File:** `specs/game.spec.ts`

| Journey | Acceptance |
| --- | --- |
| Game home | `/` directly shows the menu, modes, ranking, settings, and rules. |
| Classic scoring | A deterministic opening can complete a line and persist score 18. |
| Session restore | Refresh and returning to `/` resume an unfinished game. |
| Preferences | Language, music, sound, and reduced motion persist independently. |
| Best scores | The score page summarizes the overall, classic, and daily best scores stored on the device. |
| Assets and routing | Required audio is served and invalid modes redirect to `/`. |

## Daily challenge cross-day restore

**File:** `specs/daily-session.spec.ts`

| Journey | Acceptance |
| --- | --- |
| Expired daily session | A well-formed daily save from a previous date is cleared, today's board is generated, and the bilingual cross-day notice (`data-testid="daily-expired-notice"`) appears once until the first move or a restart; it stays hidden after reload. |
| Notice language | The notice copy follows the stored language preference (English / Chinese). |
| Corrupt daily session | Malformed saves (board not 8×8, pieces length not 3, wrong field types) are silently discarded with no cross-day notice. |
| Current-day daily session | A well-formed save dated today restores normally without any notice. |
| Classic session | Classic saves restore with their existing field validation and never show the cross-day notice. |
