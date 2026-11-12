// Batches and crawls are separate upstream resources. When an agent passes one
// job's id to the other one's results tool, say so clearly instead of surfacing a
// generic 404 and leaving the agent to guess which tool to use.

import fetch, { Headers } from "node-fetch";

export type JobKind = "batch" | "crawl";

const PATH: Record<JobKind, string> = {
	batch: "batches",
	crawl: "crawls",
};

/** Job ids normally carry their kind (batch_..., crawl_...). */
export function kindFromId(id: string): JobKind | null {
	const lower = id.toLowerCase();
	if (lower.includes("crawl")) return "crawl";
	if (lower.includes("batch")) return "batch";
	return null;
}

/** The status response's `object` field also identifies the resource kind. */
export function kindFromStatus(status: Record<string, unknown>): JobKind | null {
	const object = String(status.object ?? status.type ?? status.resource ?? "").toLowerCase();
	if (object.includes("crawl")) return "crawl";
	if (object.includes("batch")) return "batch";
	return null;
}

/**
 * When the expected endpoint did not know `id`, look at the other resource once.
 * A crawl fetched through /batches is a sign the caller used the wrong tool.
 */
export async function probeOtherKind(
	id: string,
	expected: JobKind,
	headers: Headers,
	apiUrl: string,
): Promise<JobKind | null> {
	const other: JobKind = expected === "batch" ? "crawl" : "batch";
	try {
		const res = await fetch(`${apiUrl}/${PATH[other]}/${encodeURIComponent(id)}`, { method: "GET", headers });
		if (!res.ok) return null;
		const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
		return body && (kindFromStatus(body) ?? other) === other ? other : null;
	} catch {
		return null;
	}
}

export function wrongJobKindResult(requested: JobKind, actual: JobKind, id: string) {
	const expectedTool = requested === "batch" ? "get_batch_results" : "get_crawl_results";
	const actualTool = actual === "batch" ? "get_batch_results" : "get_crawl_results";
	const idField = `${requested}_id`;
	return {
		isError: true,
		content: [{
			type: "text",
			text: JSON.stringify({
				error: "wrong_job_type",
				[idField]: id,
				message:
					`"${id}" is a ${actual}, not a ${requested}. ` +
					`Use ${actualTool} with ${actual}_id "${id}" instead of ${expectedTool}.`,
			}, null, 2),
		}],
	};
}
