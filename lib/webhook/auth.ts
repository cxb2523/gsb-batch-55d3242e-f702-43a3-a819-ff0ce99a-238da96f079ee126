/**
 * Shared authentication boundary for external-transcoder webhooks.
 *
 * Every mutating entry point MUST call {@link authenticateWebhook} before
 * touching the database, so that an unconfigured server or a missing/mismatched
 * token can never result in a write.
 */

export type AuthResult =
    | { ok: true; token: string }
    | { ok: false; status: 500 | 401; error: string };

/**
 * Validates the `X-Webhook-Token` request header against the configured
 * `WEBHOOK_TOKEN`.
 *
 * - Server misconfiguration (no WEBHOOK_TOKEN) -> 500
 * - Missing header or token mismatch          -> 401
 *
 * The comparison is constant-time so a valid token cannot be inferred from
 * response timing differences.
 */
export function authenticateWebhook(
    headerToken: string | null,
    configuredToken: string | undefined,
): AuthResult {
    if (!configuredToken) {
        console.error("WEBHOOK_TOKEN is not set in environment variables.");
        return {
            ok: false,
            status: 500,
            error: "Server configuration error. Missing WEBHOOK_TOKEN",
        };
    }

    if (!headerToken || !constantTimeEquals(headerToken, configuredToken)) {
        return { ok: false, status: 401, error: "Unauthorized" };
    }

    return { ok: true, token: configuredToken };
}

/** Length-independent, position-wise constant-time string comparison. */
function constantTimeEquals(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");

    // Length mismatch still has to touch every byte of the longer buffer so
    // the work performed does not leak the configured token's length.
    let diff = ab.length ^ bb.length;
    const max = Math.max(ab.length, bb.length);
    for (let i = 0; i < max; i++) {
        diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
    }
    return diff === 0;
}
