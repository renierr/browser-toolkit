const parseRational = (v: unknown): number => {
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'number') return v;

  if (Array.isArray(v) || (typeof v === 'object' && typeof (v as any).length === 'number')) {
    const arr = Array.isArray(v) ? v : Array.from(v as any);
    if (arr.length === 0) return NaN;
    if (arr.length >= 2 && (typeof arr[0] === 'number' || typeof arr[0] === 'string')) {
      const n = Number(arr[0]);
      const d = Number(arr[1] ?? 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    return parseRational(arr[0]);
  }

  if (typeof v === 'string') {
    if (v.includes('/')) {
      const [nStr, dStr] = v.split('/');
      const n = Number(nStr);
      const d = Number(dStr);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    const num = Number(v.replace(/[^0-9+\-.eE]/g, ''));
    return Number.isFinite(num) ? num : NaN;
  }

  if (typeof v === 'object') {
    const vObj = v as Record<string, unknown>;
    if ('numerator' in vObj && 'denominator' in vObj) {
      const n = Number(vObj.numerator);
      const d = Number(vObj.denominator ?? 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    if ('num' in vObj && 'den' in vObj) {
      const n = Number(vObj.num);
      const d = Number(vObj.den ?? 1);
      return Number.isFinite(n) && d !== 0 ? n / d : NaN;
    }
    if ('value' in vObj) return parseRational(vObj.value);

    if (typeof vObj[0] !== 'undefined') return parseRational([vObj[0], vObj[1]]);
  }
  return NaN;
};

const gpsArrayToDecimal = (arr: unknown): number => {
  if (arr === undefined || arr === null) return NaN;
  const parts = Array.isArray(arr)
    ? arr
    : typeof arr === 'object' && 'length' in arr
      ? Array.from(arr as ArrayLike<unknown>)
      : null;
  if (!parts) return NaN;
  const [degRaw, minRaw = 0, secRaw = 0] = parts;
  const deg = parseRational(degRaw);
  const min = parseRational(minRaw);
  const sec = parseRational(secRaw);
  if (![deg, min, sec].every((n) => Number.isFinite(n))) return NaN;
  return deg + min / 60 + sec / 3600;
};

const gpsParseDescriptionToDecimal = (desc: unknown): number => {
  if (desc === undefined || desc === null) return NaN;
  const s = String(desc);
  const single = s.match(/-?\d+(?:\.\d+)?/);
  if (single && single.length) {
    const allNums = s.match(/-?\d+(?:\.\d+)?/g) || [];
    if (allNums.length === 1 && allNums[0].includes('.')) return Number(allNums[0]);
    if (allNums.length >= 3) {
      const d = Number(allNums[0]);
      const m = Number(allNums[1]);
      const sec = Number(allNums[2]);
      if ([d, m, sec].every(Number.isFinite)) return d + m / 60 + sec / 3600;
    }
    return Number(allNums[0]);
  }
  return NaN;
};

const gpsApplyHemisphereReferences = (coord: number, refTag: unknown): number => {
  if (!Number.isFinite(coord)) return NaN;
  const refTagRecord = refTag as Record<string, unknown>;
  const ref = String(refTagRecord?.description ?? refTagRecord?.value ?? refTag ?? '')
    .trim()
    .toUpperCase();
  if (ref.startsWith('S') || ref.startsWith('W') || ref === 'SOUTH' || ref === 'WEST')
    return -Math.abs(coord);
  return coord;
};

/**
 * Parses GPS coordinates from EXIF tags (latitude, longitude and their references).
 */
export const gpsParseCoordinateFromExifTags = (
  longTag: unknown,
  latTag: unknown,
  longRefTag: unknown,
  latRefTag: unknown
): { longitude: number; latitude: number } => {
  let latDecimal = NaN;
  let lonDecimal = NaN;

  const latTagRecord = latTag as Record<string, unknown>;
  const longTagRecord = longTag as Record<string, unknown>;

  if (latTagRecord?.value) latDecimal = gpsArrayToDecimal(latTagRecord.value);
  if (longTagRecord?.value) lonDecimal = gpsArrayToDecimal(longTagRecord.value);

  if (!Number.isFinite(latDecimal))
    latDecimal = gpsParseDescriptionToDecimal(
      latTagRecord?.description ?? latTagRecord?.value ?? latTag
    );
  if (!Number.isFinite(lonDecimal))
    lonDecimal = gpsParseDescriptionToDecimal(
      longTagRecord?.description ?? longTagRecord?.value ?? longTag
    );

  const finalLat = gpsApplyHemisphereReferences(latDecimal, latRefTag);
  const finalLon = gpsApplyHemisphereReferences(lonDecimal, longRefTag);

  return { longitude: finalLon, latitude: finalLat };
};

/**
 * Generates a Google Maps search link for the given coordinates.
 */
export const gpsGenerateGoogleMapsLink = (lat: number, lon: number): string => {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
};
