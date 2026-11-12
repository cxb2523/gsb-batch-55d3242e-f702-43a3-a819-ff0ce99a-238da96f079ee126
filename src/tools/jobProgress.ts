// Shared helpers for reporting how far a crawl or batch has got, and for resuming
// a listing from a cursor. Progress numbers are always read from the upstream
// status response, never estimated from the request we sent.

export type JobKind = "batch" | "crawl";

/** First finite number among the given upstream fields. */
export function numberField(...values: unknown[]): number | null {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim() !== "") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

export interface JobProgress {
	status: string;
	completed: number | null;
	total: number | null;
	/** Position to resume the item/page listing from. */
	cursor: number | null;
}

export function batchProgress(status: Record<string, unknown>): JobProgress {
	const completed = numberField(status.completed_urls, status.completed_items, status.completed);
	const total = numberField(status.total_urls, status.total_items, status.total);
	return {
		status: String(status.status ?? "").toLowerCase(),
		completed,
		total,
		cursor: numberField(status.next_cursor, status.cursor) ?? completed,
	};
}

export function crawlProgress(status: Record<string, unknown>): JobProgress {
	const completed = numberField(status.pages_completed, status.pages_count, status.completed_pages);
	const total = numberField(status.pages_total, status.max_pages, status.total_pages);
	return {
		status: String(status.status ?? "").toLowerCase(),
		completed,
		total,
		cursor: numberField(status.next_cursor, status.cursor) ?? completed,
	};
}

// A listing can legitimately end on an empty page, so the API may hand out a
// cursor one page past the last item. Remember the cursors we returned as
// next_cursor: following one of those is a normal "read the empty last page",
// while an arbitrary cursor past the end is a real mistake and must be reported.
const issuedCursors = new Map<string, Set<number>>();

function issuedKey(kind: JobKind, id: string, limit: number): string {
	return `${kind}:${id}:${limit}`;
}

export function rememberNextCursor(kind: JobKind, id: string, limit: number, cursor: unknown): void {
	if (typeof cursor !== "number" || !Number.isFinite(cursor)) return;
	const key = issuedKey(kind, id, limit);
	let cursors = issuedCursors.get(key);
	if (!cursors) {
		// Bound the registry; only recent jobs and page sizes are likely to be followed.
		if (issuedCursors.size >= 512) {
			const oldestKey = issuedCursors.keys().next().value;
			if (oldestKey !== undefined) issuedCursors.delete(oldestKey);
		}
		cursors = new Set<number>();
		issuedCursors.set(key, cursors);
	}
	// Keep this bounded; only the most recent continuation points matter.
	if (cursors.size >= 64) {
		const oldest = cursors.values().next().value;
		if (oldest !== undefined) cursors.delete(oldest);
	}
	cursors.add(cursor);
}

export function isKnownNextCursor(kind: JobKind, id: string, limit: number, cursor: number): boolean {
	return issuedCursors.get(issuedKey(kind, id, limit))?.has(cursor) ?? false;
}

/** A cursor past the upstream item/page count, unless it is one we handed out. */
export function cursorOutOfRange(
	kind: JobKind,
	id: string,
	cursor: number,
	total: number | null,
	limit: number,
): boolean {
	if (total === null || cursor <= total) return false;
	return !isKnownNextCursor(kind, id, limit, cursor);
}

export function cursorOutOfRangeResult(kind: JobKind, id: string, cursor: number, total: number) {
	const resultsTool = kind === "batch" ? "get_batch_results" : "get_crawl_results";
	const idField = kind === "batch" ? "batch_id" : "crawl_id";
	const countField = kind === "batch" ? "total_urls" : "pages_total";
	const noun = kind === "batch" ? "URLs" : "pages";
	return {
		isError: true,
		content: [{
			type: "text",
			text: JSON.stringify({
				error: "cursor_out_of_range",
				[idField]: id,
				[countField]: total,
				cursor,
				message:
					`Cursor ${cursor} is out of range: this ${kind} has ${total} ${noun}. ` +
					`Use cursor 0 to read from the start, or a cursor returned as next_cursor by ${resultsTool}.`,
			}, null, 2),
		}],
	};
}
