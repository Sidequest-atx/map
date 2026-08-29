declare module "piexifjs" {
  interface TagMap {
    [name: string]: number;
  }
  const piexif: {
    load(data: string): Record<string, Record<number, unknown>>;
    dump(exifObj: Record<string, Record<number, unknown>>): string;
    insert(exifBytes: string, jpegData: string): string;
    remove(jpegData: string): string;
    ImageIFD: TagMap & { DateTime: number; Software: number; ImageDescription: number; Make: number; Model: number; Orientation: number };
    ExifIFD: TagMap & { DateTimeOriginal: number; DateTimeDigitized: number; UserComment: number };
    GPSIFD: TagMap & {
      GPSVersionID: number;
      GPSLatitudeRef: number;
      GPSLatitude: number;
      GPSLongitudeRef: number;
      GPSLongitude: number;
      GPSAltitudeRef: number;
      GPSAltitude: number;
      GPSTimeStamp: number;
      GPSDateStamp: number;
      GPSImgDirectionRef: number;
      GPSImgDirection: number;
      GPSMapDatum: number;
      GPSHPositioningError?: number;
    };
    GPSHelper: {
      degToDmsRational(deg: number): [number, number][];
      dmsRationalToDeg(dms: [number, number][], ref: string): number;
    };
  };
  export default piexif;
}
