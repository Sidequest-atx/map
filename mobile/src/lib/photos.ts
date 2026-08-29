import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { copyIntoPhotos, readBase64, writeBase64Jpeg } from "../data/fs";
import { embedGeoExif, readGeoExif, type ExifGeo } from "./exif";

export const ALBUM_NAME = "SideQuest ATX";
const LONG_EDGE = 2016;
const THUMB_EDGE = 480;

export interface StoredPhoto {
  photoUri: string;
  thumbUri: string;
  width: number;
  height: number;
}

function fitSize(w: number, h: number, edge: number): { width?: number; height?: number } {
  if (w <= 0 || h <= 0) return { width: edge };
  if (Math.max(w, h) <= edge) return w >= h ? { width: w } : { height: h };
  return w >= h ? { width: edge } : { height: edge };
}

async function resizeToBase64(uri: string, w: number, h: number, edge: number, quality: number) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize(fitSize(w, h, edge));
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return { base64: out.base64 ?? "", width: out.width, height: out.height, uri: out.uri };
}

/**
 * Turn a fresh capture (camera, library, or glasses import) into what the
 * ledger keeps:
 *  1. resize to ≤2016px long edge, JPEG 0.85 (≈400–700 KB: plenty for a
 *     vision model, small enough to keep a thousand of them)
 *  2. write the GPS fix, heading, accuracy, and timestamp into the EXIF
 *  3. store full + ~480px thumb in the app's documents folder
 * Saving to the Photos album happens at submit (finalizePhoto), once the pin
 * is final, so the copy in Photos carries the same coordinates as the record.
 */
export async function processCapture(
  srcUri: string,
  src: { width: number; height: number },
  geo: ExifGeo | null,
  opts: { id: string; longEdge?: number },
): Promise<StoredPhoto> {
  const full = await resizeToBase64(srcUri, src.width, src.height, opts.longEdge ?? LONG_EDGE, 0.85);
  let withExif = full.base64;
  if (geo) {
    try {
      withExif = embedGeoExif(full.base64, geo);
    } catch (e) {
      console.warn("[photos] EXIF embed failed; storing without GPS tags", e);
    }
  }
  const fullFile = writeBase64Jpeg(`${opts.id}.jpg`, withExif);
  const thumb = await resizeToBase64(fullFile.uri, full.width, full.height, THUMB_EDGE, 0.7);
  const thumbFile = await copyIntoPhotos(thumb.uri, `${opts.id}.t.jpg`);
  return { photoUri: fullFile.uri, thumbUri: thumbFile.uri, width: full.width, height: full.height };
}

/** Re-embed EXIF in place (after the reporter dragged the pin). */
export async function rewriteExif(photoUri: string, id: string, geo: ExifGeo): Promise<void> {
  const b64 = await readBase64(photoUri);
  const out = embedGeoExif(b64, geo);
  writeBase64Jpeg(`${id}.jpg`, out);
}

/** Adds a file to the SideQuest ATX album (creating it on first use). Needs add-only permission. */
export async function saveToAlbum(fileUri: string): Promise<{ assetId?: string; note?: string }> {
  const perm = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
  if (!perm.granted) return { note: "Photos access was declined; the photo is still kept inside the app." };
  const existing = await MediaLibrary.Album.get(ALBUM_NAME);
  if (existing) {
    const asset = await MediaLibrary.Asset.create(fileUri, existing);
    return { assetId: asset.id };
  }
  const album = await MediaLibrary.Album.create(ALBUM_NAME, [fileUri]);
  const assets = await album.getAssets();
  const last = assets[assets.length - 1];
  return { assetId: last?.id };
}

/** Read the GPS tag back out of a stored photo, to show the reporter the file really carries it. */
export async function verifyStoredExif(photoUri: string): Promise<{ lat: number; lng: number; takenAt?: Date } | null> {
  try {
    return readGeoExif(await readBase64(photoUri));
  } catch {
    return null;
  }
}
