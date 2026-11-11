import type { Kysely, Transaction } from "kysely";
import type { DB } from "../../database/kysely-types.ts";
import type { VideoRepository, VideoTransaction } from "./types.ts";

/**
 * Kysely/Postgres implementation of the webhook persistence port.
 */
export class KyselyVideoRepository implements VideoRepository {
    private readonly database: Kysely<DB>;

    constructor(database: Kysely<DB>) {
        this.database = database;
    }

    async transaction<T>(
        work: (trx: VideoTransaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction().execute((trx) =>
            work(new KyselyVideoTransaction(trx)),
        );
    }
}

class KyselyVideoTransaction implements VideoTransaction {
    private readonly trx: Transaction<DB>;

    constructor(trx: Transaction<DB>) {
        this.trx = trx;
    }

    async resetStaleProcessing(staleBefore: Date): Promise<number> {
        const result = await this.trx
            .updateTable("video")
            .set({ status: "UPLOADED" })
            .where("lastStatusUpdate", "<", staleBefore)
            .where("status", "=", "PROCESSING")
            .executeTakeFirst();

        return Number(result.numUpdatedRows ?? 0);
    }

    async claimNextUploaded(now: Date): Promise<string | undefined> {
        // FOR UPDATE SKIP LOCKED: concurrent claimers lock different rows, so
        // the same video can never be handed out twice. The status guard on
        // the UPDATE is a second line of defense.
        const video = await this.trx
            .selectFrom("video")
            .select(["id"])
            .where("status", "=", "UPLOADED")
            .orderBy("lastStatusUpdate", "asc")
            .limit(1)
            .forUpdate()
            .skipLocked()
            .executeTakeFirst();

        if (!video) {
            return undefined;
        }

        const result = await this.trx
            .updateTable("video")
            .set({ status: "PROCESSING", lastStatusUpdate: now })
            .where("id", "=", video.id)
            .where("status", "=", "UPLOADED")
            .executeTakeFirst();

        if (Number(result.numUpdatedRows ?? 0) === 0) {
            // Another transaction claimed it first; roll back and signal empty.
            throw new ClaimLostError(video.id);
        }

        return video.id;
    }

    async reportStatus(input: {
        id: string;
        status: "DONE" | "FAILED";
        duration: number;
    }): Promise<boolean> {
        const result = await this.trx
            .updateTable("video")
            .set({ status: input.status, duration: input.duration })
            .where("id", "=", input.id)
            .executeTakeFirst();

        return Number(result.numUpdatedRows ?? 0) > 0;
    }
}

/**
 * Thrown inside a claim transaction when the guarded UPDATE matched no rows
 * (a concurrent transaction won the race). The service layer treats this as
 * "nothing to claim right now" rather than a server failure.
 */
export class ClaimLostError extends Error {
    readonly videoId: string;

    constructor(videoId: string) {
        super(`Video ${videoId} was claimed by another transaction`);
        this.name = "ClaimLostError";
        this.videoId = videoId;
    }
}
