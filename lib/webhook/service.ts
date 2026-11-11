import { z } from "zod";
import { authenticateWebhook } from "./auth.ts";
import { ClaimLostError } from "./kysely-video-repository.ts";
import type { JsonResponse, VideoRepository, WebhookConfig } from "./types.ts";

/**
 * Strict body schema for status reports: only `id`, `status` and the optional
 * `duration` are accepted. Any unknown field, wrong type or status outside
 * DONE/FAILED makes the request a 400 before any write is attempted.
 */
const reportSchema = z
    .object({
        id: z.string().min(1),
        status: z.enum(["DONE", "FAILED"]),
        duration: z.number().optional(),
    })
    .strict();

const json = (status: number, body: unknown): JsonResponse => ({
    status,
    body,
});

/**
 * GET /api/video/getNext
 *
 * Claims one video for the external transcoder. All state changes (reset of
 * timed-out PROCESSING videos and the UPLOADED -> PROCESSING flip) happen in
 * a single transaction, and the token is verified before any write.
 */
export async function handleClaimNext(
    req: Request,
    repo: VideoRepository,
    config: WebhookConfig,
): Promise<JsonResponse> {
    const auth = authenticateWebhook(
        req.headers.get("X-Webhook-Token"),
        config.webhookToken,
    );
    if (!auth.ok) {
        return json(auth.status, { error: auth.error });
    }

    const now = config.now ? config.now() : new Date();
    const staleBefore = new Date(
        now.getTime() - config.markFailedAfterMinutes * 60 * 1000,
    );

    try {
        const id = await repo.transaction(async (trx) => {
            await trx.resetStaleProcessing(staleBefore);
            return trx.claimNextUploaded(now);
        });

        if (id === undefined) {
            return json(200, { message: "No video requires transcoding" });
        }

        return json(200, { id });
    } catch (error) {
        if (error instanceof ClaimLostError) {
            // Lost a concurrent race: nothing was claimed. The caller can poll
            // again; this is not a server failure.
            return json(200, { message: "No video requires transcoding" });
        }
        console.error("Transaction failed:", error);
        return json(500, { error: "Failed to process video" });
    }
}

/**
 * POST /api/video/updateStatus
 *
 * The token is checked first (no token / bad token / missing server config
 * all fail closed), then the body is strictly validated, and only then is the
 * database touched. A report for an unknown id is an explicit non-200 failure.
 */
export async function handleReportStatus(
    req: Request,
    repo: VideoRepository,
    config: WebhookConfig,
): Promise<JsonResponse> {
    const auth = authenticateWebhook(
        req.headers.get("X-Webhook-Token"),
        config.webhookToken,
    );
    if (!auth.ok) {
        return json(auth.status, { error: auth.error });
    }

    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return json(400, { error: "Invalid input", details: "Body must be valid JSON" });
    }

    const parsed = reportSchema.safeParse(rawBody);
    if (!parsed.success) {
        return json(400, { error: "Invalid input", details: parsed.error.issues });
    }

    const { id, status, duration = 0 } = parsed.data;

    try {
        const updated = await repo.transaction((trx) =>
            trx.reportStatus({ id, status, duration }),
        );

        if (!updated) {
            return json(404, { error: `Video with id ${id} not found` });
        }

        return json(200, { response: `Status updated for video id: ${id}` });
    } catch (error) {
        console.error("Error processing request:", error);
        return json(500, { error: "Internal Server Error" });
    }
}
