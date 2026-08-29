import piexif from "piexifjs";

/**
 * Writes the capture position into the JPEG itself, so every SideQuest photo
 * carries its coordinates even if it is ever separated from the app's ledger
 * (AirDrop, Photos export, a future data migration). Pure JS; runs on a
 * ~500 KB base64 string in well under 100 ms on a modern phone.
 */
export interface ExifGeo {
  lat: number;
  lng: number;
  altitudeM?: number | null;
  /** degrees true north the camera faced */
  headingDeg?: number | null;
  /** horizontal accuracy radius, metres */
  accuracyM?: number | null;
  /** when the shutter fired */
  takenAt: Date;
  description?: string;
  userComment?: string;
  software?: string;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** EXIF local date format: YYYY:MM:DD HH:MM:SS */
export function exifLocalDate(d: Date): string {
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function rational(v: number, den = 100): [number, number] {
  return [Math.round(v * den), den];
}

function b64ToBinary(b64: string): string {
  return globalThis.atob(b64);
}
function binaryToB64(bin: string): string {
  return globalThis.btoa(bin);
}

/**
 * Returns a new base64 JPEG (no data: prefix) with the GPS and date tags set.
 * Any EXIF already present is kept; the GPS block is replaced wholesale.
 */
export function embedGeoExif(jpegBase64: string, geo: ExifGeo): string {
  const bin = b64ToBinary(jpegBase64);
  let exif: Record<string, Record<number, unknown>>;
  try {
    exif = piexif.load(bin) as Record<string, Record<number, unknown>>;
  } catch {
    exif = { "0th": {}, Exif: {}, GPS: {}, Interop: {}, "1st": {} };
  }
  const zeroth = (exif["0th"] ??= {});
  const ex = (exif.Exif ??= {});
  const gps: Record<number, unknown> = {};

  zeroth[piexif.ImageIFD.DateTime] = exifLocalDate(geo.takenAt);
  zeroth[piexif.ImageIFD.Software] = geo.software ?? "SideQuest ATX";
  if (geo.description) zeroth[piexif.ImageIFD.ImageDescription] = geo.description;
  ex[piexif.ExifIFD.DateTimeOriginal] = exifLocalDate(geo.takenAt);
  ex[piexif.ExifIFD.DateTimeDigitized] = exifLocalDate(geo.takenAt);
  if (geo.userComment) {
    // ASCII character code header per EXIF spec, then the comment.
    ex[piexif.ExifIFD.UserComment] = "ASCII\0\0\0" + geo.userComment;
  }

  gps[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
  gps[piexif.GPSIFD.GPSLatitudeRef] = geo.lat >= 0 ? "N" : "S";
  gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(geo.lat));
  gps[piexif.GPSIFD.GPSLongitudeRef] = geo.lng >= 0 ? "E" : "W";
  gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(geo.lng));
  if (geo.altitudeM != null && isFinite(geo.altitudeM)) {
    gps[piexif.GPSIFD.GPSAltitudeRef] = geo.altitudeM >= 0 ? 0 : 1;
    gps[piexif.GPSIFD.GPSAltitude] = rational(Math.abs(geo.altitudeM));
  }
  const u = geo.takenAt;
  gps[piexif.GPSIFD.GPSTimeStamp] = [
    [u.getUTCHours(), 1],
    [u.getUTCMinutes(), 1],
    [u.getUTCSeconds() * 100, 100],
  ];
  gps[piexif.GPSIFD.GPSDateStamp] = `${u.getUTCFullYear()}:${pad(u.getUTCMonth() + 1)}:${pad(u.getUTCDate())}`;
  if (geo.headingDeg != null && isFinite(geo.headingDeg) && geo.headingDeg >= 0) {
    gps[piexif.GPSIFD.GPSImgDirectionRef] = "T";
    gps[piexif.GPSIFD.GPSImgDirection] = rational(geo.headingDeg % 360);
  }
  if (geo.accuracyM != null && isFinite(geo.accuracyM) && piexif.GPSIFD.GPSHPositioningError != null) {
    gps[piexif.GPSIFD.GPSHPositioningError] = rational(geo.accuracyM);
  }
  gps[piexif.GPSIFD.GPSMapDatum] = "WGS-84";
  exif.GPS = gps;

  const exifBytes = piexif.dump(exif);
  const out = piexif.insert(exifBytes, bin);
  return binaryToB64(out);
}

/** Reads GPS + DateTimeOriginal back out of a JPEG (base64). Used to verify a write and to import foreign photos. */
export function readGeoExif(jpegBase64: string): { lat: number; lng: number; takenAt?: Date } | null {
  try {
    const exif = piexif.load(b64ToBinary(jpegBase64)) as Record<string, Record<number, unknown>>;
    const gps = exif.GPS ?? {};
    const lat = gps[piexif.GPSIFD.GPSLatitude] as [number, number][] | undefined;
    const lng = gps[piexif.GPSIFD.GPSLongitude] as [number, number][] | undefined;
    if (!lat || !lng) return null;
    const latRef = (gps[piexif.GPSIFD.GPSLatitudeRef] as string) ?? "N";
    const lngRef = (gps[piexif.GPSIFD.GPSLongitudeRef] as string) ?? "E";
    const toDeg = (dms: [number, number][]) => dms[0][0] / dms[0][1] + dms[1][0] / dms[1][1] / 60 + dms[2][0] / dms[2][1] / 3600;
    const la = toDeg(lat) * (latRef === "S" ? -1 : 1);
    const ln = toDeg(lng) * (lngRef === "W" ? -1 : 1);
    const dto = (exif.Exif ?? {})[piexif.ExifIFD.DateTimeOriginal] as string | undefined;
    let takenAt: Date | undefined;
    if (dto && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(dto)) {
      const [d, t] = dto.split(" ");
      const [Y, M, D] = d.split(":").map(Number);
      const [h, m, s] = t.split(":").map(Number);
      takenAt = new Date(Y, M - 1, D, h, m, s);
    }
    return { lat: la, lng: ln, takenAt };
  } catch {
    return null;
  }
}
