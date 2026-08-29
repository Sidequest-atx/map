import * as MediaLibrary from "expo-media-library";
import { positionAt, type Interpolated } from "../lib/geo";
import type { TrailPoint } from "../types";

/**
 * Pull the photos taken during a walk out of the Photos library and place
 * each one on the trail by its timestamp.
 *
 * Ray-Ban Meta captures sync into the Meta AI app and, with auto-import on,
 * land in the camera roll with their original capture time. They carry no
 * GPS (the glasses have none), so the phone's breadcrumb trail is the
 * position source. If a photo *does* carry GPS (say, a phone photo taken on
 * the same walk), we trust the EXIF instead.
 */
export interface WalkPhoto {
  assetId: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  /** epoch ms the library says the photo was created */
  takenAt: number;
  /** EXIF GPS if the photo had it */
  exifLocation: { lat: number; lng: number } | null;
  /** where the trail says the walker was (after clock offset) */
  onTrail: Interpolated;
  /** the coordinates we will use, and why */
  lat: number;
  lng: number;
  method: "photo-exif" | "trail-interpolated";
  /** true when the picture is likely from glasses/another camera rather than this phone's camera app */
  external: boolean;
}

const PAD_MS = 3 * 60_000;

export async function findWalkPhotos(
  trail: TrailPoint[],
  window: { startMs: number; endMs: number },
  clockOffsetS = 0,
): Promise<{ ok: true; photos: WalkPhoto[] } | { ok: false; reason: string }> {
  const perm = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
  if (!perm.granted) return { ok: false, reason: "Photos access is needed to find the pictures taken during the walk." };

  const assets = await new MediaLibrary.Query()
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .gte(MediaLibrary.AssetField.CREATION_TIME, window.startMs - PAD_MS)
    .lte(MediaLibrary.AssetField.CREATION_TIME, window.endMs + PAD_MS)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
    .limit(400)
    .exe();

  const photos: WalkPhoto[] = [];
  for (const a of assets) {
    try {
      const info = await a.getInfo();
      const takenAt = info.creationTime ?? info.modificationTime ?? window.startMs;
      let exifLocation: { lat: number; lng: number } | null = null;
      try {
        const loc = await a.getLocation();
        if (loc && isFinite(loc.latitude) && isFinite(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
          exifLocation = { lat: loc.latitude, lng: loc.longitude };
        }
      } catch {
        /* no location metadata */
      }
      const onTrail = positionAt(trail, takenAt + clockOffsetS * 1000);
      const useExif = Boolean(exifLocation);
      photos.push({
        assetId: a.id,
        uri: info.uri,
        filename: info.filename,
        width: info.width,
        height: info.height,
        takenAt,
        exifLocation,
        onTrail,
        lat: useExif ? exifLocation!.lat : onTrail.lat,
        lng: useExif ? exifLocation!.lng : onTrail.lng,
        method: useExif ? "photo-exif" : "trail-interpolated",
        external: !exifLocation,
      });
    } catch (e) {
      console.warn("[walk] skip asset", a.id, e);
    }
  }
  return { ok: true, photos };
}

/** Re-place trail-matched photos after the user nudges the clock offset. */
export function rematch(photos: WalkPhoto[], trail: TrailPoint[], clockOffsetS: number): WalkPhoto[] {
  return photos.map((p) => {
    const onTrail = positionAt(trail, p.takenAt + clockOffsetS * 1000);
    if (p.method === "photo-exif") return { ...p, onTrail };
    return { ...p, onTrail, lat: onTrail.lat, lng: onTrail.lng };
  });
}

/** Plain-language confidence for a trail placement. */
export function placementNote(p: WalkPhoto): string {
  if (p.method === "photo-exif") return "Placed from the photo's own GPS tag.";
  const t = p.onTrail;
  if (t.how === "none") return "No trail points; place the pin by hand.";
  const gap = t.gapS < 1 ? "under a second" : `${Math.round(t.gapS)} s`;
  const acc = t.accuracyM != null ? `, GPS ±${Math.round(t.accuracyM)} m` : "";
  if (t.how === "nearest") return `Outside the recorded trail by ${gap}; snapped to its end${acc}. Check the pin.`;
  return `Between two breadcrumbs (${gap} from the nearest${acc}).`;
}
