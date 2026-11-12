import { z } from "zod";
import { Headers } from "node-fetch";
import fetch from "node-fetch";
import { getCrawlResults } from "./getCrawlResults.js";
import { isRunning, unexpectedStatus } from "./jobStatus.js";
import { crawlProgress } from "./jobProgress.js";

const OLOSTEP_API_URL = process.env.OLOSTEP_API_URL ?? "https://api.olostep.com/v1";
const OLOSTEP_CRAWL_API_URL = `${OLOSTEP_API_URL}/crawls`;

export interface OlostepCrawlResponse {
	id?: string;
	crawl_id?: string;
	object?: string;
	status?: string;
	start_url?: string;
	max_pages?: number;
	created?: string;
	formats?: string[];
	country?: string;
	parser?: string;
}

export const createCrawl = {
	name: "create_crawl",
	description:
		"Use this when you need the content of many pages from one website, such as a docs section or a blog: " +
		"it follows links from a start URL and scrapes each page it finds, up to `max_pages`. " +
		"Waits up to `wait_for_completion_seconds` (default 45) and returns the pages if the crawl finishes in that time; " +
		"otherwise returns a crawl_id, completed/total counts and a `cursor` to pass to get_crawl_results (not get_batch_results). " +
		"For a known list of URLs use batch_scrape_urls; for one page use scrape_website.",
	schema: {
		url: z.string().url().optional().describe("Starting URL for the crawl."),
		start_url: z.string().url().optional().describe("Alias for `url`."),
		max_pages: z.number().int().min(1).default(10).describe("Maximum number of pages to crawl. Set to 1 to scrape only the start URL."),
		output_format: z
			.enum(["markdown", "html", "json", "text"])
			.default("markdown")
			.describe('Format for scraped content. Default: "markdown".'),
		country: z.string().optional().describe("Optional country code for location-specific crawling."),
		parser: z.string().optional().describe("Optional parser ID for specialized content extraction."),
		wait_for_completion_seconds: z
			.number()
			.int()
			.min(0)
			.max(300)
			.default(45)
			.describe("Seconds to wait for the crawl to finish and return its pages in this call. 0 returns the crawl_id right away."),
	},
	handler: async (
		{
			url,
			start_url,
			max_pages,
			output_format,
			country,
			parser,
			wait_for_completion_seconds,
		}: {
			url?: string;
			start_url?: string;
			max_pages?: number;
			output_format: "markdown" | "html" | "json" | "text";
			country?: string;
			parser?: string;
			wait_for_completion_seconds?: number;
		},
		apiKey: string,
		orbitKey?: string,
	) => {
		const targetUrl = url ?? start_url;
		if (!targetUrl) {
			return { isError: true, content: [{ type: "text", text: "Error: a 'url' is required." }] };
		}
		try {
			const headers = new Headers({
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			});

			const formats: string[] = [output_format];
			const payload: Record<string, unknown> = {
				start_url: targetUrl,
				max_pages: max_pages ?? 10,
				formats,
			};
			if (country) payload.country = country;
			if (orbitKey) payload.force_connection_id = orbitKey;
			if (parser) payload.parser_extract = { parser_id: parser };

			const response = await fetch(OLOSTEP_CRAWL_API_URL, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				let errorDetails: unknown = null;
				try {
					errorDetails = await response.json();
				} catch {
					// ignore
				}
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `Olostep API Error: ${response.status} ${response.statusText}. Details: ${JSON.stringify(
								errorDetails,
							)}`,
						},
					],
				};
			}

			const data = (await response.json()) as OlostepCrawlResponse;

			// Wait for small crawls and hand back the pages directly, so the caller
			// doesn't need a second call for the common case.
			const waitSeconds = wait_for_completion_seconds ?? 45;
			const crawlId = data.id ?? data.crawl_id;
			if (waitSeconds > 0 && crawlId) {
				const pollIntervalMs = 5_000;
				const deadline = Date.now() + waitSeconds * 1000;
				let lastStatus: Record<string, unknown> | null = null;

				while (Date.now() < deadline) {
					// Do not overshoot a short wait by a whole poll interval.
					const remainingMs = Math.max(0, deadline - Date.now());
					await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remainingMs)));

					const statusRes = await fetch(
						`${OLOSTEP_API_URL}/crawls/${encodeURIComponent(crawlId)}`,
						{ method: "GET", headers },
					);
					if (!statusRes.ok) {
						let errorDetails: unknown = null;
						try {
							errorDetails = await statusRes.json();
						} catch {
							// ignore
						}
						return {
							isError: true,
							content: [{
								type: "text",
								text: `Olostep API Error: ${statusRes.status} ${statusRes.statusText} while checking crawl "${crawlId}". Details: ${JSON.stringify(errorDetails)}`,
							}],
						};
					}

					const statusData = (await statusRes.json()) as Record<string, unknown>;
					lastStatus = statusData;
					const status = String(statusData.status || "").toLowerCase();

					if (status === "completed") {
						// Fetch and return the pages directly, so the caller doesn't need
						// a second call for the common case.
						return await getCrawlResults.handler(
							{ crawl_id: crawlId, formats: [output_format], items_limit: Math.min(max_pages ?? 10, 20) },
							apiKey,
						);
					}
					// A failed crawl or an unrecognized status won't recover by waiting longer.
					if (!isRunning(status)) return unexpectedStatus("crawl", { crawl_id: crawlId, ...statusData });
				}

				// Still running: report the upstream progress and where the caller can
				// resume reading, so the job is not mistaken for a failure or restarted.
				const progress = crawlProgress({ ...(data as Record<string, unknown>), ...(lastStatus ?? {}) });
				const status = progress.status || String(data.status ?? "").toLowerCase();
				return {
					content: [{
						type: "text",
						text: JSON.stringify({
							...data,
							crawl_id: crawlId,
							status,
							pages_completed: progress.completed,
							pages_total: progress.total,
							completed_items: progress.completed,
							total_items: progress.total,
							cursor: progress.cursor,
							message:
								`Crawl is still ${status} after ${waitSeconds}s: ${progress.completed ?? 0} of ` +
								`${progress.total ?? "an unknown number of"} pages completed. Continue with ` +
								`get_crawl_results using crawl_id "${crawlId}" and cursor ${progress.cursor ?? 0}; ` +
								"do not start a new crawl.",
						}, null, 2),
					}],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(data, null, 2),
					},
				],
			};
		} catch (error: unknown) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Error: Failed to create crawl. ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	},
};


