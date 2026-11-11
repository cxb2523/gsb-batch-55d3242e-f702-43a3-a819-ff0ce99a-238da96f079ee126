import { Audio } from '@/core/audio';
import { Video } from '@/core/video';
import { Segmenter } from '@/constants';
import { HttpClient } from '@/utils/httpClient';
import { VideodbError } from '@/utils/error';

interface RecordedRequest {
  method: string;
  path: string[];
  data?: unknown;
  options?: { params?: Record<string, unknown> };
}

/**
 * Fake HttpClient that records every request (method, path, params, body)
 * and replays queued responses. No real network is involved.
 */
class FakeHttpClient {
  public requests: RecordedRequest[] = [];
  private responses: unknown[] = [];

  public queueResponse(data: unknown) {
    this.responses.push({ data });
  }

  private next() {
    return this.responses.length > 0 ? this.responses.shift() : { data: {} };
  }

  public get = async (
    path: string[],
    options?: { params?: Record<string, unknown> }
  ) => {
    this.requests.push({ method: 'GET', path, options });
    return this.next();
  };

  public post = async (
    path: string[],
    data?: unknown,
    options?: { params?: Record<string, unknown> }
  ) => {
    this.requests.push({ method: 'POST', path, data, options });
    return this.next();
  };

  public delete = async (path: string[]) => {
    this.requests.push({ method: 'DELETE', path });
    return this.next();
  };
}

const makeAudio = (http: FakeHttpClient) =>
  new Audio(http as unknown as HttpClient, {
    id: 'a-1',
    collectionId: 'c-1',
    length: 60,
    name: 'audio',
    size: '100',
    userId: 'u-1',
  });

const makeVideo = (http: FakeHttpClient) =>
  new Video(http as unknown as HttpClient, {
    id: 'v-1',
    collectionId: 'c-1',
    length: 60,
    name: 'video',
    size: '100',
    streamUrl: 'https://example.com/stream',
    userId: 'u-1',
    playerUrl: 'https://example.com/player',
  });

// Responses are queued post-conversion (camelCase), as the real HttpClient
// converts snake_case response bodies before handing them to callers.
const transcriptResponse = {
  wordTimestamps: [{ start: 0, end: 1, text: 'hello' }],
  text: 'hello world',
};

describe('transcript alignment between audio and video', () => {
  describe('audio getTranscript request params', () => {
    it('sends custom start/end/segmenter/length/force in the request', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const audio = makeAudio(http);

      await audio.getTranscript(2, 10, Segmenter.time, 5, true);

      expect(http.requests).toHaveLength(1);
      const req = http.requests[0];
      expect(req.method).toBe('GET');
      expect(req.path).toEqual(['audio', 'a-1', 'transcription']);
      expect(req.options?.params).toEqual({
        start: 2,
        end: 10,
        segmenter: Segmenter.time,
        length: 5,
        force: 'true',
      });
    });

    it('falls back to word/1 defaults when segmenter and length are omitted', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const audio = makeAudio(http);

      await audio.getTranscript();

      expect(http.requests[0].options?.params).toMatchObject({
        segmenter: Segmenter.word,
        length: 1,
        force: 'false',
      });
    });
  });

  describe('video getTranscriptText', () => {
    it('sends interval and custom segmentation params and returns text', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const video = makeVideo(http);

      const text = await video.getTranscriptText(1, 8, Segmenter.sentence, 3);

      expect(text).toBe('hello world');
      expect(http.requests).toHaveLength(1);
      const req = http.requests[0];
      expect(req.method).toBe('GET');
      expect(req.path).toEqual(['video', 'v-1', 'transcription']);
      expect(req.options?.params).toEqual({
        start: 1,
        end: 8,
        segmenter: Segmenter.sentence,
        length: 3,
      });
    });

    it('defaults to word segmenter with length 1 when omitted', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const video = makeVideo(http);

      await video.getTranscriptText();

      expect(http.requests[0].options?.params).toMatchObject({
        segmenter: Segmenter.word,
        length: 1,
      });
    });

    it('returns an empty string when the response has no text', async () => {
      const http = new FakeHttpClient();
      http.queueResponse({ wordTimestamps: [] });
      const video = makeVideo(http);

      await expect(video.getTranscriptText()).resolves.toBe('');
    });
  });

  describe('audio getTranscriptText', () => {
    it('sends interval and custom segmentation params and returns text', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const audio = makeAudio(http);

      const text = await audio.getTranscriptText(1, 8, Segmenter.time, 4);

      expect(text).toBe('hello world');
      expect(http.requests).toHaveLength(1);
      const req = http.requests[0];
      expect(req.method).toBe('GET');
      expect(req.path).toEqual(['audio', 'a-1', 'transcription']);
      expect(req.options?.params).toMatchObject({
        start: 1,
        end: 8,
        segmenter: Segmenter.time,
        length: 4,
      });
    });

    it('returns an empty string when the response has no text', async () => {
      const http = new FakeHttpClient();
      http.queueResponse({ wordTimestamps: [] });
      const audio = makeAudio(http);

      await expect(audio.getTranscriptText()).resolves.toBe('');
    });
  });

  describe('parameter validation', () => {
    it.each([
      ['invalid segmenter', [0, 5, 'paragraph', 1], /Invalid segmenter 'paragraph'/],
      ['negative start', [-1, 5, Segmenter.word, 1], /start must be non-negative, got -1/],
      ['negative end', [0, -5, Segmenter.word, 1], /end must be non-negative, got -5/],
      ['start greater than end', [10, 5, Segmenter.word, 1], /start \(10\) must be less than or equal to end \(5\)/],
    ])(
      'video getTranscriptText rejects %s without making a request',
      async (_label, args, message) => {
        const http = new FakeHttpClient();
        const video = makeVideo(http);

        await expect(
          video.getTranscriptText(
            ...(args as [number, number, string, number])
          )
        ).rejects.toThrow(VideodbError);
        await expect(
          video.getTranscriptText(
            ...(args as [number, number, string, number])
          )
        ).rejects.toThrow(message);
        expect(http.requests).toHaveLength(0);
      }
    );

    it.each([
      ['invalid segmenter', [0, 5, 'paragraph', 1], /Invalid segmenter 'paragraph'/],
      ['negative start', [-1, 5, Segmenter.word, 1], /start must be non-negative, got -1/],
      ['negative end', [0, -5, Segmenter.word, 1], /end must be non-negative, got -5/],
      ['start greater than end', [10, 5, Segmenter.word, 1], /start \(10\) must be less than or equal to end \(5\)/],
    ])(
      'audio getTranscriptText rejects %s without making a request',
      async (_label, args, message) => {
        const http = new FakeHttpClient();
        const audio = makeAudio(http);

        await expect(
          audio.getTranscriptText(
            ...(args as [number, number, string, number])
          )
        ).rejects.toThrow(VideodbError);
        await expect(
          audio.getTranscriptText(
            ...(args as [number, number, string, number])
          )
        ).rejects.toThrow(message);
        expect(http.requests).toHaveLength(0);
      }
    );

    it('audio getTranscript rejects invalid params without making a request', async () => {
      const http = new FakeHttpClient();
      const audio = makeAudio(http);

      await expect(audio.getTranscript(0, 5, 'nope')).rejects.toThrow(
        /Invalid segmenter 'nope'/
      );
      await expect(audio.getTranscript(-2)).rejects.toThrow(
        /start must be non-negative, got -2/
      );
      await expect(audio.getTranscript(9, 3)).rejects.toThrow(
        /start \(9\) must be less than or equal to end \(3\)/
      );
      expect(http.requests).toHaveLength(0);
    });
  });

  describe('audio transcript caching', () => {
    it('reuses the cached transcript when no force and no interval are given', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      const audio = makeAudio(http);

      const first = await audio.getTranscript();
      const second = await audio.getTranscript();

      expect(first).toEqual([{ start: 0, end: 1, text: 'hello' }]);
      expect(second).toEqual(first);
      expect(http.requests).toHaveLength(1);
    });

    it('re-fetches and overwrites the cache when force is passed', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      http.queueResponse({
        wordTimestamps: [{ start: 0, end: 2, text: 'forced' }],
        text: 'forced text',
      });
      const audio = makeAudio(http);

      await audio.getTranscript();
      const forced = await audio.getTranscript(
        undefined,
        undefined,
        Segmenter.word,
        1,
        true
      );

      expect(http.requests).toHaveLength(2);
      expect(http.requests[1].options?.params).toMatchObject({
        force: 'true',
      });
      expect(forced).toEqual([{ start: 0, end: 2, text: 'forced' }]);
      // cache was overwritten: a later cached read returns the new data
      const cached = await audio.getTranscript();
      expect(cached).toEqual([{ start: 0, end: 2, text: 'forced' }]);
      expect(http.requests).toHaveLength(2);
    });

    it('re-fetches when an interval is given, even with start = 0', async () => {
      const http = new FakeHttpClient();
      http.queueResponse(transcriptResponse);
      http.queueResponse(transcriptResponse);
      const audio = makeAudio(http);

      await audio.getTranscript();
      await audio.getTranscript(0, 5);

      expect(http.requests).toHaveLength(2);
      expect(http.requests[1].options?.params).toMatchObject({
        start: 0,
        end: 5,
      });
    });
  });
});
