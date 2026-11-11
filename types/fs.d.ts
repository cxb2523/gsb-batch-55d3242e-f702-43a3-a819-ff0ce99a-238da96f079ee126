/** `$dsh/fs` — the workspace, under the session's own access mode. See `types/chat.d.ts`. */
declare module "$dsh/fs" {
  /** The file's text. Rejects when it does not exist or the session may not read it. */
  export function readFile(path: string): Promise<string>;
  /** One directory entry. Treat `size` as optional — draw nothing rather than `0 B` when it is missing. */
  export type DirEntry = { name: string; type?: "file" | "directory"; size?: number };
  /** A directory's entries — enough to draw a tree without probing each name. */
  export function readdir(path: string): Promise<DirEntry[]>;
  /**
   * The file's raw bytes — for audio, MIDI, images, anything not text.
   *
   * `readFile` decodes as UTF-8 and would corrupt them silently. Capped at 8MB.
   */
  export function readBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /**
   * A refusal, told apart from a breakage.
   *
   * `denied` is the field to branch on: the session said no, and no retry changes that —
   * show the reader what would have been written and let them apply it another way.
   * Anything else (a missing directory, a full disk) is an outage and reads as one.
   */
  export type FsError = Error & { denied?: boolean; code?: string };
  /**
   * Writes the file, under the session's own access mode.
   *
   * Rejects with a `FsError` whose `denied` is true when the session may not write —
   * `code` is `FS_SANDBOX_DENIED` there. **A write the reader did not ask for is not
   * yours to make**: put it behind a control they press.
   */
  export function writeFile(path: string, content: string): Promise<void>;
}
