import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleReportStatus } from "../lib/webhook/service.ts";
import { InMemoryVideoRepository } from "./helpers/in-memory-video-repository.mts";
import {
    TOKEN,
    assertStatus,
    config,
    postRequest,
} from "./helpers/http.mts";

describe("POST /api/video/updateStatus — authentication boundary", () => {
    it("returns 500 and performs no writes when WEBHOOK_TOKEN is not configured", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING" });
        const before = repo.snapshot();

        const res = await handleReportStatus(
            postRequest({ id: "v1", status: "DONE" }, TOKEN),
            repo,
            config({ webhookToken: undefined }),
        );

        assertStatus(res, 500);
        assert.match(String((res.body as { error: string }).error), /WEBHOOK_TOKEN/);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
        assert.equal(repo.get("v1")?.status, "PROCESSING");
    });

    it("returns 401 and performs no writes when the header is missing", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING" });
        const before = repo.snapshot();

        const res = await handleReportStatus(
            postRequest({ id: "v1", status: "DONE" }),
            repo,
            config(),
        );

        assertStatus(res, 401);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
    });

    it("returns 401 and performs no writes when the token is wrong", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING" });
        const before = repo.snapshot();

        const res = await handleReportStatus(
            postRequest({ id: "v1", status: "DONE" }, "nope"),
            repo,
            config(),
        );

        assertStatus(res, 401);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
        assert.equal(repo.get("v1")?.status, "PROCESSING");
    });
});

describe("POST /api/video/updateStatus — input validation", () => {
    const invalidBodies: Array<[string, unknown]> = [
        ["status outside the enum", { id: "v1", status: "UPLOADED" }],
        ["unknown status string", { id: "v1", status: "PROCESSING" }],
        ["missing id", { status: "DONE" }],
        ["empty id", { id: "", status: "DONE" }],
        ["missing status", { id: "v1" }],
        ["extra unexpected field", { id: "v1", status: "DONE", role: "admin" }],
        ["id with wrong type", { id: 42, status: "DONE" }],
        ["duration with wrong type", { id: "v1", status: "DONE", duration: "10" }],
    ];

    for (const [label, body] of invalidBodies) {
        it(`rejects invalid input (${label}) with 400 and no writes`, async () => {
            const repo = new InMemoryVideoRepository();
            repo.seed({ id: "v1", status: "PROCESSING" });
            const before = repo.snapshot();

            const res = await handleReportStatus(
                postRequest(body, TOKEN),
                repo,
                config(),
            );

            assertStatus(res, 400);
            assert.equal(repo.snapshot(), before);
            assert.equal(repo.writeCount, 0);
            assert.equal(repo.get("v1")?.status, "PROCESSING");
        });
    }

    it("returns 400 for malformed JSON without writing", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING" });
        const before = repo.snapshot();

        const res = await handleReportStatus(
            postRequest("{not-json", TOKEN),
            repo,
            config(),
        );

        assertStatus(res, 400);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
    });
});

describe("POST /api/video/updateStatus — successful reports", () => {
    it("updates an existing video to DONE with its duration", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING", duration: 0 });

        const res = await handleReportStatus(
            postRequest({ id: "v1", status: "DONE", duration: 125 }, TOKEN),
            repo,
            config(),
        );

        assertStatus(res, 200);
        const video = repo.get("v1");
        assert.equal(video?.status, "DONE");
        assert.equal(video?.duration, 125);
        assert.equal(repo.writeCount, 1);
    });

    it("updates an existing video to FAILED and defaults duration to 0 when omitted", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING", duration: 7 });

        const res = await handleReportStatus(
            postRequest({ id: "v1", status: "FAILED" }, TOKEN),
            repo,
            config(),
        );

        assertStatus(res, 200);
        const video = repo.get("v1");
        assert.equal(video?.status, "FAILED");
        assert.equal(video?.duration, 0);
    });
});

describe("POST /api/video/updateStatus — unknown target", () => {
    it("returns a non-200 failure (404) for an unknown id and writes nothing", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "PROCESSING" });
        const before = repo.snapshot();

        const res = await handleReportStatus(
            postRequest({ id: "does-not-exist", status: "DONE", duration: 3 }, TOKEN),
            repo,
            config(),
        );

        assert.notEqual(res.status, 200);
        assert.equal(res.status, 404);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
        assert.equal(repo.get("v1")?.status, "PROCESSING");
    });
});
