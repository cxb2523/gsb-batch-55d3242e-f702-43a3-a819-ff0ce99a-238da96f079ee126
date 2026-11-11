import type { JsonResponse, WebhookConfig } from "../../lib/webhook/types.ts";

export const TOKEN = "test-webhook-secret";

export function config(
    overrides: Partial<WebhookConfig> = {},
): WebhookConfig {
    return {
        webhookToken: TOKEN,
        markFailedAfterMinutes: 600,
        ...overrides,
    };
}

export function getRequest(token?: string | null): Request {
    const headers = new Headers();
    if (token !== undefined && token !== null) {
        headers.set("X-Webhook-Token", token);
    }
    return new Request("http://localhost/api/video/getNext", {
        method: "GET",
        headers,
    });
}

export function postRequest(
    body: unknown,
    token?: string | null,
): Request {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token !== undefined && token !== null) {
        headers.set("X-Webhook-Token", token);
    }
    return new Request("http://localhost/api/video/updateStatus", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

export function assertStatus(
    response: JsonResponse,
    expected: number,
): void {
    if (response.status !== expected) {
        throw new Error(
            `Expected status ${expected}, got ${response.status}: ${JSON.stringify(response.body)}`,
        );
    }
}
