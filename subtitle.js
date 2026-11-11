/*
 * Subtitle loading, validation, SRT -> WebVTT conversion and track lifecycle.
 *
 * Design goals:
 *  - Subtitle text is always fetched (or read from a local blob) and validated
 *    BEFORE any <track> is mounted.
 *  - SRT content is converted to WebVTT and mounted via a blob URL.
 *  - Only the subtitle of the current video exists in the player. Switching
 *    sources tears down the previous track and revokes its blob URL.
 *  - An async fetch that finishes after the user switched videos is discarded:
 *    it can never overwrite the subtitle state of the newer video.
 *
 * Exposed as the global `SubtitleModule` (classic script, works from file://).
 */
(function (global) {
  "use strict";

  const VTT_HEADER_RE = /^WEBVTT(?:[ \t].*)?$/;
  // 00:00:00,000 --> 00:00:02,000  (SRT) or 00:00.000 --> 00:02.000 (VTT)
  const TIMING_LINE_RE =
    /^\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}[ \t]+-->[ \t]+\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}/;

  /**
   * Remove a leading UTF-8 BOM, if present.
   */
  function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  /**
   * A line is a valid cue timing line in either SRT (comma) or VTT (dot) form.
   */
  function isTimingLine(line) {
    return TIMING_LINE_RE.test(line.trim());
  }

  /**
   * Recognize the subtitle format of raw text.
   * @returns {"vtt" | "srt" | null}
   */
  function detectSubtitleFormat(text) {
    if (typeof text !== "string" || text.trim() === "") {
      return null;
    }

    const normalized = stripBom(text).replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");

    if (VTT_HEADER_RE.test(lines[0].trim())) {
      return "vtt";
    }

    // No WEBVTT header: only accept if there is at least one legal SRT-style
    // timing line, e.g. "1\n00:00:01,000 --> 00:00:03,000\n...".
    if (lines.some(isTimingLine)) {
      return "srt";
    }

    return null;
  }

  /**
   * Convert SRT text into WebVTT text.
   * - prepend the mandatory WEBVTT header
   * - turn comma decimal separators in timestamps into dots
   */
  function srtToVtt(srtText) {
    const body = stripBom(srtText).replace(/\r\n?/g, "\n");
    const converted = body
      .split("\n")
      .map((line) => {
        if (isTimingLine(line)) {
          return line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
        }
        return line;
      })
      .join("\n");

    return "WEBVTT\n\n" + converted.trimStart() + "\n";
  }

  /**
   * Validate raw subtitle text and return the WebVTT text ready to mount,
   * or null when the content is neither recognizable WebVTT nor SRT.
   */
  function prepareSubtitleText(text) {
    const format = detectSubtitleFormat(text);
    if (format === "vtt") {
      return { format, vttText: stripBom(text) };
    }
    if (format === "srt") {
      return { format, vttText: srtToVtt(text) };
    }
    return null;
  }

  /**
   * Fetch a subtitle URL and read its text.
   * Rejects on network errors, CORS blocking (fetch throws) and non-2xx
   * responses. Callers treat any rejection as "do not mount".
   */
  async function fetchSubtitleText(url, fetchImpl) {
    const runFetch = fetchImpl || global.fetch;
    if (typeof runFetch !== "function") {
      throw new Error("fetch is not available");
    }

    let response;
    try {
      response = await runFetch(url);
    } catch (error) {
      // Network failure or CORS blocked by the browser.
      throw new Error("Subtitle request failed: " + (error && error.message ? error.message : "network error"));
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 0;
      throw new Error("Subtitle request returned status " + status);
    }

    return await response.text();
  }

  function createVttBlobUrl(vttText) {
    const blob = new Blob([vttText], { type: "text/vtt" });
    return URL.createObjectURL(blob);
  }

  /**
   * Owns the single subtitle <track> of a <video> element and its blob URL.
   */
  class SubtitleController {
    constructor(videoElement) {
      this.video = videoElement;
      this.trackElement = null;
      this.objectUrl = null;
      this.sequence = 0;
    }

    /**
     * Remove the current track and release its blob URL.
     * Safe to call when nothing is mounted.
     */
    clear() {
      if (this.trackElement && this.trackElement.parentNode) {
        this.trackElement.parentNode.removeChild(this.trackElement);
      }
      this.trackElement = null;

      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }
    }

    _mount(vttText) {
      this.clear();
      this.objectUrl = createVttBlobUrl(vttText);

      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = "English";
      track.srclang = "en";
      track.default = true;
      track.src = this.objectUrl;

      this.video.appendChild(track);
      this.trackElement = track;

      if (this.video.textTracks && this.video.textTracks.length) {
        this.video.textTracks[this.video.textTracks.length - 1].mode = "showing";
      }

      return this.objectUrl;
    }

    /**
     * Switch to a new subtitle source.
     *
     * @param {string} source URL or blob URL of the raw subtitle; "" clears.
     * @param {object} [options]
     * @param {Function} [options.fetchImpl] injectable fetch (tests).
     * @returns {Promise<object>} result describing what happened. Stale
     *   requests (a newer switch happened while awaiting) resolve with
     *   `stale: true` and never touch the player.
     */
    async switchSource(source, options) {
      const opts = options || {};
      const requestId = ++this.sequence;
      const isStale = () => requestId !== this.sequence;

      // Always tear down the previous track and release its blob synchronously,
      // even before the new (possibly slow) fetch resolves. A stale in-flight
      // request never reaches _mount, so it can never create a blob of its own.
      this.clear();

      // No subtitle for the new video: guarantee the old track is gone.
      if (!source) {
        return { status: "empty", stale: false };
      }

      let rawText;
      try {
        rawText = await fetchSubtitleText(source, opts.fetchImpl);
      } catch (error) {
        if (isStale()) {
          return { status: "stale", stale: true };
        }
        return {
          status: "fetch-error",
          stale: false,
          error,
          message: error && error.message ? error.message : String(error),
        };
      }

      if (isStale()) {
        return { status: "stale", stale: true };
      }

      const prepared = prepareSubtitleText(rawText);
      if (!prepared) {
        return { status: "invalid-format", stale: false };
      }

      if (isStale()) {
        return { status: "stale", stale: true };
      }

      const objectUrl = this._mount(prepared.vttText);
      return {
        status: "loaded",
        stale: false,
        format: prepared.format,
        objectUrl,
      };
    }
  }

  global.SubtitleModule = {
    detectSubtitleFormat,
    srtToVtt,
    prepareSubtitleText,
    fetchSubtitleText,
    createVttBlobUrl,
    SubtitleController,
  };
})(typeof window !== "undefined" ? window : this);
