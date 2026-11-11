import { db } from "@/database/db";
import { KyselyVideoRepository } from "./kysely-video-repository.ts";
import type { VideoRepository, WebhookConfig } from "./types.ts";

export const videoRepository: VideoRepository = new KyselyVideoRepository(db);

/** Default retry window (minutes) when MARK_FAILED_AFTER is unset/invalid. */
const DEFAULT_MARK_FAILED_AFTER_MINUTES = 600;

/**
 * Reads webhook configuration from the environment once per request so tests
 * can mutate process.env between calls.
 */
export function getWebhookConfig(): WebhookConfig {
    let markFailedAfterMinutes = DEFAULT_MARK_FAILED_AFTER_MINUTES;
    const raw = process.env.MARK_FAILED_AFTER;
    if (raw !== undefined) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            markFailedAfterMinutes = parsed;
        } else {
            console.warn(`Invalid value for MARK_FAILED_AFTER: ${raw}`);
            console.warn(`Using ${DEFAULT_MARK_FAILED_AFTER_MINUTES} minutes as default`);
        }
    }

    return {
        webhookToken: process.env.WEBHOOK_TOKEN,
        markFailedAfterMinutes,
    };
}
