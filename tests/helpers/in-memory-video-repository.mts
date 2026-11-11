import type {
    VideoRecord,
    VideoRepository,
    VideoTransaction,
} from "../../lib/webhook/types.ts";
import type { VideoStatus } from "../../database/kysely-types.ts";

/**
 * In-memory test double for {@link VideoRepository}.
 *
 * It reproduces the database guarantees the handlers rely on:
 * - `transaction()` serializes work with a mutex and rolls back on throw,
 *   mirroring a Postgres transaction;
 * - claim locks the chosen row and `SKIP LOCKED` means a concurrent
 *   transaction picks the next available row instead of blocking,
 *   so two requests can never claim the same video;
 * - every mutating call increments `writeCount`, letting tests assert that
 *   rejected requests performed no writes at all.
 */
export class InMemoryVideoRepository implements VideoRepository {
    private videos = new Map<string, VideoRecord>();
    private lockedIds = new Set<string>();
    private mutex: Promise<unknown> = Promise.resolve();
    public writeCount = 0;

    seed(video: Partial<VideoRecord> & { id: string }): VideoRecord {
        const record: VideoRecord = {
            status: "UPLOADED",
            duration: 0,
            lastStatusUpdate: new Date(),
            ...video,
        };
        this.videos.set(record.id, record);
        return structuredClone(record);
    }

    get(id: string): VideoRecord | undefined {
        const record = this.videos.get(id);
        return record ? structuredClone(record) : undefined;
    }

    all(): VideoRecord[] {
        return [...this.videos.values()].map((v) => structuredClone(v));
    }

    /** Snapshot used to assert that a request did not mutate any row. */
    snapshot(): string {
        return JSON.stringify(this.all());
    }

    /**
     * Runs `work` exclusively. On throw all changes made through the
     * transaction object are rolled back and the error is rethrown.
     */
    async transaction<T>(work: (trx: VideoTransaction) => Promise<T>): Promise<T> {
        const previous = this.mutex;
        let release: () => void;
        this.mutex = new Promise<void>((resolve) => {
            release = () => resolve();
        });
        await previous;

        const checkpoint = this.snapshot();
        const lockedHere: string[] = [];
        try {
            const result = await work(
                new InMemoryTransaction(this, (id) => {
                    lockedHere.push(id);
                }),
            );
            return result;
        } catch (error) {
            // Roll back every row to its state at transaction start.
            const rows = JSON.parse(checkpoint) as VideoRecord[];
            this.videos = new Map(rows.map((row) => [row.id, row]));
            throw error;
        } finally {
            for (const id of lockedHere) {
                this.lockedIds.delete(id);
            }
            release!();
        }
    }

    /** Test hook: how many rows are currently locked by an open transaction. */
    get lockedRowCount(): number {
        return this.lockedIds.size;
    }

    markLocked(id: string): void {
        this.lockedIds.add(id);
    }

    isLocked(id: string): boolean {
        return this.lockedIds.has(id);
    }

    update(id: string, patch: Partial<VideoRecord>): void {
        const current = this.videos.get(id);
        if (!current) {
            throw new Error(`Cannot update unknown video ${id}`);
        }
        this.writeCount += 1;
        this.videos.set(id, { ...current, ...patch });
    }

    resetIfStale(staleBefore: Date): number {
        let changed = 0;
        for (const video of this.videos.values()) {
            if (
                video.status === "PROCESSING" &&
                video.lastStatusUpdate.getTime() < staleBefore.getTime()
            ) {
                this.update(video.id, { status: "UPLOADED" });
                changed += 1;
            }
        }
        return changed;
    }

    claimOne(now: Date): string | undefined {
        const candidates = [...this.videos.values()]
            .filter((v) => v.status === "UPLOADED" && !this.lockedIds.has(v.id))
            .sort(
                (a, b) =>
                    a.lastStatusUpdate.getTime() - b.lastStatusUpdate.getTime(),
            );
        const picked = candidates[0];
        if (!picked) {
            return undefined;
        }
        // FOR UPDATE SKIP LOCKED equivalent.
        this.markLocked(picked.id);
        return picked.id;
    }

    statuses(): Record<string, VideoStatus> {
        const out: Record<string, VideoStatus> = {};
        for (const video of this.videos.values()) {
            out[video.id] = video.status;
        }
        return out;
    }
}

class InMemoryTransaction implements VideoTransaction {
    private readonly repo: InMemoryVideoRepository;
    private readonly onLock: (id: string) => void;

    constructor(
        repo: InMemoryVideoRepository,
        onLock: (id: string) => void,
    ) {
        this.repo = repo;
        this.onLock = onLock;
    }

    async resetStaleProcessing(staleBefore: Date): Promise<number> {
        return this.repo.resetIfStale(staleBefore);
    }

    async claimNextUploaded(now: Date): Promise<string | undefined> {
        const id = this.repo.claimOne(now);
        if (id === undefined) {
            return undefined;
        }
        this.onLock(id);
        this.repo.update(id, { status: "PROCESSING", lastStatusUpdate: now });
        return id;
    }

    async reportStatus(input: {
        id: string;
        status: "DONE" | "FAILED";
        duration: number;
    }): Promise<boolean> {
        if (!this.repo.get(input.id)) {
            return false;
        }
        this.repo.update(input.id, {
            status: input.status,
            duration: input.duration,
        });
        return true;
    }
}
