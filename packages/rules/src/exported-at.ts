// Renders the roster `exportedAt` instant in UTC and in site-local wall-clock time.
// Pure: no I/O, no clock. Never throws; a failure is returned as a value.

/** Why an `exportedAt` value could not be rendered. */
export type ExportedAtProblem = "invalid-exported-at" | "invalid-time-zone";

/** Result of rendering `exportedAt`: both renderings on success, or the problem. */
export type ExportedAtRendering =
  | {
      ok: true;
      /** The instant truncated to the minute, `YYYY-MM-DDTHH:mmZ`. */
      utcMinute: string;
      /** Wall-clock time at the site, `YYYY-MM-DDTHH:mm`, with no offset. */
      siteLocal: string;
      /** The IANA time zone the site-local time was rendered in. */
      timeZone: string;
    }
  | { ok: false; problem: ExportedAtProblem };

const UTC_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z$/;

const MS_PER_MINUTE = 60_000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Parses a UTC instant to epoch milliseconds, or `undefined` if it is not a real instant. */
function parseUtcInstant(exportedAt: string): number | undefined {
  const match = UTC_INSTANT.exec(exportedAt);
  if (match === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  const parts = [year, month, day, hour, minute, second ?? "0"].map(Number);
  const [y, mo, d, h, mi, s] = parts;
  if (
    y === undefined ||
    mo === undefined ||
    d === undefined ||
    h === undefined ||
    mi === undefined ||
    s === undefined
  ) {
    return undefined;
  }
  const millis = Number((fraction ?? "0").padEnd(3, "0"));
  const epoch = Date.UTC(y, mo - 1, d, h, mi, s, millis);
  const instant = new Date(epoch);
  // Round-trip the components so impossible dates (2027-02-30, hour 24) are rejected.
  const roundTrips =
    instant.getUTCFullYear() === y &&
    instant.getUTCMonth() === mo - 1 &&
    instant.getUTCDate() === d &&
    instant.getUTCHours() === h &&
    instant.getUTCMinutes() === mi &&
    instant.getUTCSeconds() === s;
  return roundTrips ? epoch : undefined;
}

/** Wall-clock `YYYY-MM-DDTHH:mm` in `timeZone`, or `undefined` if the zone is invalid. */
function formatSiteLocal(epochMinute: number, timeZone: string): string | undefined {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatter.formatToParts(new Date(epochMinute))) {
    values[part.type] = part.value;
  }
  const { year, month, day, hour, minute } = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return undefined;
  }
  return `${year.padStart(4, "0")}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Renders the roster `exportedAt` UTC instant as a UTC minute and as site-local wall-clock time.
 * Never throws.
 */
export function renderExportedAt(exportedAt: string, timeZone: string): ExportedAtRendering {
  const epoch = parseUtcInstant(exportedAt);
  if (epoch === undefined) {
    return { ok: false, problem: "invalid-exported-at" };
  }
  const epochMinute = Math.floor(epoch / MS_PER_MINUTE) * MS_PER_MINUTE;
  const siteLocal = formatSiteLocal(epochMinute, timeZone);
  if (siteLocal === undefined) {
    return { ok: false, problem: "invalid-time-zone" };
  }
  const instant = new Date(epochMinute);
  const utcMinute =
    `${pad(instant.getUTCFullYear(), 4)}-${pad(instant.getUTCMonth() + 1, 2)}-` +
    `${pad(instant.getUTCDate(), 2)}T${pad(instant.getUTCHours(), 2)}:` +
    `${pad(instant.getUTCMinutes(), 2)}Z`;
  return { ok: true, utcMinute, siteLocal, timeZone };
}
