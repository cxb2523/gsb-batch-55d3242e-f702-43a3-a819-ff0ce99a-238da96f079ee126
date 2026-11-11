import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleClaimNext } from "../lib/webhook/service.ts";
import { InMemoryVideoRepository } from "./helpers/in-memory-video-repository.mts";
import { TOKEN, assertStatus, config, getRequest } from "./helpers/http.mts";

const MINUTE = 60 * 1000;

describe("GET /api/video/getNext — authentication boundary", () => {
    it("returns 500 and performs no writes when WEBHOOK_TOKEN is not configured", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "UPLOADED" });
        const before = repo.snapshot();

        const res = await handleClaimNext(
            getRequest(TOKEN),
            repo,
            config({ webhookToken: undefined }),
        );

        assertStatus(res, 500);
        assert.match(String((res.body as { error: string }).error), /WEBHOOK_TOKEN/);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
        assert.deepEqual(repo.statuses(), { v1: "UPLOADED" });
    });

    it("returns 401 and performs no writes when the header is missing", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "UPLOADED" });
        const before = repo.snapshot();

        const res = await handleClaimNext(getRequest(), repo, config());

        assertStatus(res, 401);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
    });

    it("returns 401 and performs no writes when the token is wrong", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "UPLOADED" });
        const before = repo.snapshot();

        const res = await handleClaimNext(
            getRequest("wrong-token"),
            repo,
            config(),
        );

        assertStatus(res, 401);
        assert.equal(repo.snapshot(), before);
        assert.equal(repo.writeCount, 0);
        assert.deepEqual(repo.statuses(), { v1: "UPLOADED" });
    });
});

describe("GET /api/video/getNext — successful claim", () => {
    it("claims an UPLOADED video, flips it to PROCESSING and returns its id", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "UPLOADED" });
        const now = new Date("2026-11-11T10:00:00.000Z");

        const res = await handleClaimNext(getRequest(TOKEN), repo, config({ now: () => now }));

        assertStatus(res, 200);
        assert.deepEqual(res.body, { id: "v1" });
        const claimed = repo.get("v1");
        assert.equal(claimed?.status, "PROCESSING");
        assert.deepEqual(claimed?.lastStatusUpdate, now);
        assert.ok(repo.writeCount > 0);
    });

    it("returns an explicit no-task message when nothing is UPLOADED", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "v1", status: "DONE" });
        repo.seed({ id: "v2", status: "FAILED" });

        const res = await handleClaimNext(getRequest(TOKEN), repo, config());

        assertStatus(res, 200);
        assert.deepEqual(res.body, { message: "No video requires transcoding" });
        assert.deepEqual(repo.statuses(), { v1: "DONE", v2: "FAILED" });
    });

    it("resets timed-out PROCESSING videos back to UPLOADED within the transaction, then claims one", async () => {
        const repo = new InMemoryVideoRepository();
        const now = new Date("2026-11-11T10:00:00.000Z");
        // Stale: last update 601 minutes ago with a 600-minute window.
        repo.seed({
            id: "stale",
            status: "PROCESSING",
            lastStatusUpdate: new Date(now.getTime() - 601 * MINUTE),
        });
        // Fresh PROCESSING must be left untouched.
        repo.seed({
            id: "fresh",
            status: "PROCESSING",
            lastStatusUpdate: new Date(now.getTime() - 5 * MINUTE),
        });

        const res = await handleClaimNext(
            getRequest(TOKEN),
            repo,
            config({ now: () => now }),
        );

        assertStatus(res, 200);
        assert.deepEqual(res.body, { id: "stale" });
        assert.equal(repo.get("stale")?.status, "PROCESSING"); // re-claimed
        assert.deepEqual(repo.get("stale")?.lastStatusUpdate, now);
        assert.equal(repo.get("fresh")?.status, "PROCESSING"); // untouched
        assert.notDeepEqual(repo.get("fresh")?.lastStatusUpdate, now);
    });
});

describe("GET /api/video/getNext — concurrent claims", () => {
    it("never hands the same video to two concurrent requests", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "a", status: "UPLOADED" });
        repo.seed({ id: "b", status: "UPLOADED" });
        repo.seed({ id: "c", status: "UPLOADED" });

        const [r1, r2, r3, r4] = await Promise.all([
            handleClaimNext(getRequest(TOKEN), repo, config()),
            handleClaimNext(getRequest(TOKEN), repo, config()),
            handleClaimNext(getRequest(TOKEN), repo, config()),
            handleClaimNext(getRequest(TOKEN), repo, config()),
        ]);

        const claimedIds = [r1, r2, r3]
            .map((r) => (r.body as { id?: string }).id)
            .filter((id): id is string => id !== undefined);
        assert.equal(claimedIds.length, 3);
        assert.equal(new Set(claimedIds).size, 3, "each video claimed exactly once");
        assert.deepEqual(new Set(claimedIds), new Set(["a", "b", "c"]));

        // Fourth request finds nothing left.
        assertStatus(r4, 200);
        assert.deepEqual(r4.body, { message: "No video requires transcoding" });

        // Every video ended up PROCESSING exactly once.
        assert.deepEqual(repo.statuses(), {
            a: "PROCESSING",
            b: "PROCESSING",
            c: "PROCESSING",
        });
        assert.equal(repo.lockedRowCount, 0, "locks released after transactions");
    });

    it("a row locked by another transaction is skipped, not double-claimed", async () => {
        const repo = new InMemoryVideoRepository();
        repo.seed({ id: "locked", status: "UPLOADED" });
        repo.seed({ id: "free", status: "UPLOADED" });
        repo.markLocked("locked"); // simulate an in-flight transaction's row lock

        const res = await handleClaimNext(getRequest(TOKEN), repo, config());

        assertStatus(res, 200);
        assert.deepEqual(res.body, { id: "free" });
        assert.equal(repo.get("locked")?.status, "UPLOADED");
        assert.equal(repo.get("free")?.status, "PROCESSING");
    });
});
