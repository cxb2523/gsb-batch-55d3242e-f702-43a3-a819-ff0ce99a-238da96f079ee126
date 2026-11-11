/** `$dsh/web` — one web search, through whichever provider the host composed. */
declare module "$dsh/web" {
  /** One citeable result. Only `url` is guaranteed: not every provider returns the rest. */
  export type SearchSource = {
    url: string;
    title?: string;
    snippet?: string;
    /** Publication or crawl time, as the provider's own ISO-8601 string. */
    publishedAt?: string;
  };
  /** What one search returns. */
  export type SearchResult = {
    /** A generated answer or summary, when the provider makes one — DeepSeek and Exa do not. */
    content?: string;
    sources: readonly SearchSource[];
    /** True when the result set was cut down to `maxResults`. */
    truncated: boolean;
  };
  /**
   * Runs one search and resolves with its sources.
   *
   * **Search only — there is no `fetch` here.** A card cannot retrieve a page body; render the
   * snippet and link to the source instead. Show the sources you used: a card that states a fact
   * from the web without the link it came from cannot be checked, and this is the one capability
   * whose output the reader has no other way to verify.
   *
   * Pass a `signal` when searching as the reader types. An aborted call REJECTS with an
   * `AbortError`, which is not a failure — ignore it (`if (e.name === "AbortError") return`).
   */
  export function search(query: string, options?: { maxResults?: number; signal?: AbortSignal }): Promise<SearchResult>;
}
