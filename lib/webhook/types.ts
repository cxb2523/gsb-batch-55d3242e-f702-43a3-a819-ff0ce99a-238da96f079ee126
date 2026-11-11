import type { VideoStatus } from "../../database/kysely-types.ts";

/** A row of the `video` table in the shape the webhook handlers need. */
export interface VideoRecord {
    id: string;
    status: VideoStatus;
    duration: number;
    lastStatusUpdate: Date;
}

/**
 * Persistence port used by the webhook handlers.
 *
 * Everything that can change video state goes through this interface, which
 * keeps the HTTP/auth/validation logic independent of the database and makes
 * it testable with in-memory fakes.
 */
export interface VideoRepository {
    /**
     * Runs `work` inside a single database transaction. Any thrown error rolls
     * the whole transaction back; the error is rethrown to the caller.
     */
    transaction<T>(work: (trx: VideoTransaction) => Promise<T>): Promise<T>;
}

export interface VideoTransaction {
    /**
     * Resets videos stuck in PROCESSING whose status has not been updated
     * since `staleBefore` back to UPLOADED so they can be retried.
     * Returns the number of rows that were reset.
     */
    resetStaleProcessing(staleBefore: Date): Promise<number>;

    /**
     * Atomically claims one UPLOADED video: the row is locked (skipping rows
     * already locked by other transactions) and flipped to PROCESSING with a
     * fresh `lastStatusUpdate`.
     *
     * Returns the claimed video's id, or `undefined` when no UPLOADED video is
     * available. Concurrent calls must never return the same id.
     */
    claimNextUploaded(now: Date): Promise<string | undefined>;

    /**
     * Reports a transcoding result for a video. Returns `true` when an
     * existing row was updated, `false` when no video with that id exists.
     */
    reportStatus(input: {
        id: string;
        status: Extract<VideoStatus, "DONE" | "FAILED">;
        duration: number;
    }): Promise<boolean>;
}

/** Configuration consumed by the framework-agnostic webhook handlers. */
export interface WebhookConfig {
    webhookToken: string | undefined;
    /** Minutes after which a stuck PROCESSING video is retried. */
    markFailedAfterMinutes: number;
    /** Injectable clock so timeouts are deterministic in tests. */
    now?: () => Date;
}

/** Plain response shape the handlers return; routes adapt it to the framework. */
export interface JsonResponse {
    status: number;
    body: unknown;
}
