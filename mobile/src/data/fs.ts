import { Directory, File, Paths } from "expo-file-system";

/**
 * On-device layout (Paths.document is backed up by iOS and survives updates):
 *
 *   sidequest/
 *     reports.json        the ledger (metadata only, no pixels)
 *     drives.json
 *     walks.json
 *     session.json
 *     prefs.json
 *     walk-active.json    the Glasses Walk in progress, if any
 *     walk-trail.jsonl    breadcrumbs appended by the background task
 *     drive-queue.json    an interrupted Quest Drive, resumable
 *     photos/<id>.jpg     full-size JPEG with GPS EXIF
 *     photos/<id>.t.jpg   ~480px thumbnail
 */
export const ROOT = new Directory(Paths.document, "sidequest");
export const PHOTOS = new Directory(ROOT, "photos");

let ensured = false;
export function ensureDirs(): void {
  if (ensured) return;
  try {
    if (!ROOT.exists) ROOT.create({ intermediates: true, idempotent: true });
    if (!PHOTOS.exists) PHOTOS.create({ intermediates: true, idempotent: true });
    ensured = true;
  } catch (e) {
    console.warn("[fs] ensureDirs", e);
  }
}

/** Small JSON document with synchronous read/write. Corrupt files fall back to the seed. */
export class JsonDoc<T> {
  private file: File;
  private cache: T | undefined;
  constructor(private name: string, private fallback: () => T) {
    this.file = new File(ROOT, name);
  }
  read(): T {
    if (this.cache !== undefined) return this.cache;
    ensureDirs();
    try {
      if (this.file.exists) {
        const raw = this.file.textSync();
        if (raw) {
          this.cache = JSON.parse(raw) as T;
          return this.cache;
        }
      }
    } catch (e) {
      console.warn("[fs] read", this.file.uri, e);
    }
    this.cache = this.fallback();
    return this.cache;
  }
  /**
   * Write a sibling file and move it into place. expo-file-system writes strings with
   * `atomically: false` (FileSystemFile.swift), so a save interrupted by the OS killing
   * the app leaves a half-written file, and a half-written reports.json means every
   * report on the phone is gone at the next launch. The photos would survive as orphans.
   */
  write(value: T): void {
    ensureDirs();
    this.cache = value;
    const json = JSON.stringify(value);
    try {
      const tmp = new File(ROOT, `${this.name}.tmp`);
      if (tmp.exists) tmp.delete();
      tmp.create({ intermediates: true });
      tmp.write(json);
      tmp.moveSync(new File(ROOT, this.name), { overwrite: true });
      this.file = new File(ROOT, this.name);
      return;
    } catch (e) {
      console.warn("[fs] atomic write failed; writing in place", this.name, e);
    }
    try {
      if (!this.file.exists) this.file.create({ intermediates: true });
      this.file.write(json);
    } catch (e) {
      console.warn("[fs] write", this.file.uri, e);
    }
  }
  remove(): void {
    this.cache = undefined;
    try {
      if (this.file.exists) this.file.delete();
      const tmp = new File(ROOT, `${this.name}.tmp`);
      if (tmp.exists) tmp.delete();
    } catch {
      /* ignore */
    }
  }
  get uri(): string {
    return this.file.uri;
  }
}

/** Append-only text file (JSONL breadcrumbs). */
export class LineFile {
  private file: File;
  constructor(name: string) {
    this.file = new File(ROOT, name);
  }
  append(line: string): void {
    ensureDirs();
    try {
      if (!this.file.exists) this.file.create({ intermediates: true });
      this.file.write(line + "\n", { append: true });
    } catch (e) {
      console.warn("[fs] append", this.file.uri, e);
    }
  }
  readLines(): string[] {
    try {
      if (!this.file.exists) return [];
      return this.file
        .textSync()
        .split("\n")
        .filter((l) => l.trim().length > 0);
    } catch (e) {
      console.warn("[fs] readLines", this.file.uri, e);
      return [];
    }
  }
  clear(): void {
    try {
      if (this.file.exists) this.file.delete();
    } catch {
      /* ignore */
    }
  }
  get exists(): boolean {
    return this.file.exists;
  }
}

export function photoFile(name: string): File {
  ensureDirs();
  return new File(PHOTOS, name);
}

export function writeBase64Jpeg(name: string, base64: string): File {
  const f = photoFile(name);
  if (f.exists) f.delete();
  f.create({ intermediates: true });
  f.write(base64, { encoding: "base64" });
  return f;
}

export async function copyIntoPhotos(srcUri: string, name: string): Promise<File> {
  const dest = photoFile(name);
  if (dest.exists) dest.delete();
  await new File(srcUri).copy(dest);
  return dest;
}

export function readBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

export function fileExists(uri?: string): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteIfExists(uri?: string): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}

export function photosDirStats(): { files: number; bytes: number } {
  ensureDirs();
  let files = 0;
  let bytes = 0;
  try {
    for (const entry of PHOTOS.list()) {
      if (entry instanceof File) {
        files += 1;
        bytes += entry.size ?? 0;
      }
    }
  } catch {
    /* ignore */
  }
  return { files, bytes };
}
