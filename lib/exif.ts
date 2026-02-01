// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExifParser = require('exif-parser');

interface ExifData {
  timestamp: Date | null;
  latitude: number | null;
  longitude: number | null;
}

export function parseExifFromBuffer(buffer: Buffer): ExifData {
  try {
    const parser = ExifParser.create(buffer);
    const result = parser.parse();

    let timestamp: Date | null = null;
    if (result.tags?.DateTimeOriginal) {
      timestamp = new Date(result.tags.DateTimeOriginal * 1000);
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (result.tags?.GPSLatitude != null && result.tags?.GPSLongitude != null) {
      latitude = result.tags.GPSLatitude;
      longitude = result.tags.GPSLongitude;
    }

    return { timestamp, latitude, longitude };
  } catch (error) {
    console.warn('Failed to parse EXIF data:', error);
    return { timestamp: null, latitude: null, longitude: null };
  }
}

export function isTimestampRecent(timestamp: Date | null, maxAgeMinutes: number = 60): boolean {
  if (!timestamp) return false;
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes <= maxAgeMinutes;
}
