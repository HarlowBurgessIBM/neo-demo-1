// Time helpers for instants, site time zones and site-local wall-clock values.
// Pure: no I/O, no clock, no date library. Intl and Date.UTC only.
// Never throws on bad input; a failure is returned as `undefined` or a discriminated value.

/** Outcome of turning a site-local wall-clock time into an instant. */
export type LocalTimeResolution =
  | { kind: "ok"; epochMs: number }
  | { kind: "nonexistent" }
  | { kind: "ambiguous"; earlierEpochMs: number; laterEpochMs: number }
  | { kind: "malformed" }
  | { kind: "invalid-time-zone" };

const UTC_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const MS_PER_DAY = 86_400_000;
/** Largest magnitude of an epoch that `Date` can represent. */
const MAX_EPOCH_MS = 8.64e15;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Parses a UTC instant to epoch milliseconds, or `undefined` if it is not a real instant. */
export function parseUtcInstant(exportedAt: string): number | undefined {
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

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached formatter for `timeZone`, or `undefined` if the zone is not valid. */
function formatterFor(timeZone: string): Intl.DateTimeFormat | undefined {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  if (
    timeZone.length === 0 ||
    timeZone.trim() !== timeZone ||
    /^[+\-\u2212]/.test(timeZone)
  ) {
    return undefined;
  }
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
      second: "2-digit",
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return undefined;
    }
    throw error;
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

/** True when `value` is a time zone name that `Intl` accepts. Offset forms are not accepted. */
export function isValidTimeZone(value: unknown): value is string {
  return typeof value === "string" && formatterFor(value) !== undefined;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The site wall-clock components of `epochMs`, or `undefined` if it cannot be rendered. */
function wallParts(epochMs: number, timeZone: string): WallParts | undefined {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_EPOCH_MS) {
    return undefined;
  }
  const formatter = formatterFor(timeZone);
  if (formatter === undefined) {
    return undefined;
  }
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    values[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    [year, month, day, hour, minute, second].some((n) => !Number.isFinite(n))
  ) {
    return undefined;
  }
  return { year, month, day, hour, minute, second };
}

/** Epoch milliseconds of wall-clock components read as UTC. Safe for years below 100. */
function utcFromParts(parts: WallParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

/** The zone's offset from UTC, in milliseconds, at `epochMs`. */
function offsetAt(epochMs: number, timeZone: string): number | undefined {
  const parts = wallParts(epochMs, timeZone);
  return parts === undefined ? undefined : utcFromParts(parts) - epochMs;
}

function renderMinute(parts: WallParts): string {
  return (
    `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}` +
    `T${pad(parts.hour, 2)}:${pad(parts.minute, 2)}`
  );
}

/** True when the year, month and day name a real calendar date (years 0100 and later). */
function isRealDate(year: number, month: number, day: number): boolean {
  const epoch = Date.UTC(year, month - 1, day);
  const date = new Date(epoch);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** True for a strict `YYYY-MM-DD` string that is a real calendar date. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = LOCAL_DATE.exec(value);
  if (match === null) {
    return false;
  }
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** True for a strict `YYYY-MM-DDTHH:mm` string: a real date, hour 00-23, no seconds. */
export function isLocalWallTime(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = LOCAL_WALL_TIME.exec(value);
  if (match === null) {
    return false;
  }
  return (
    isRealDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    Number(match[4]) <= 23 &&
    Number(match[5]) <= 59
  );
}

/** Adds whole calendar days to a `YYYY-MM-DD` date, or `undefined` for invalid input. */
export function addDays(date: string, days: number): string | undefined {
  if (!isLocalDate(date) || !Number.isInteger(days)) {
    return undefined;
  }
  const match = LOCAL_DATE.exec(date);
  if (match === null) {
    return undefined;
  }
  const epoch =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * MS_PER_DAY;
  if (!Number.isFinite(epoch) || Math.abs(epoch) > MAX_EPOCH_MS) {
    return undefined;
  }
  const result = new Date(epoch);
  const year = result.getUTCFullYear();
  if (year < 100 || year > 9999) {
    return undefined;
  }
  return `${pad(year, 4)}-${pad(result.getUTCMonth() + 1, 2)}-${pad(result.getUTCDate(), 2)}`;
}

/** The site-local `YYYY-MM-DD` at `epochMs`, or `undefined` for a bad zone or epoch. */
export function siteLocalDate(epochMs: number, timeZone: string): string | undefined {
  const parts = wallParts(epochMs, timeZone);
  if (parts === undefined) {
    return undefined;
  }
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

/**
 * Resolves a site-local wall-clock time (`YYYY-MM-DDTHH:mm`) to an instant.
 * A time skipped by a clock change is `nonexistent`; a time that occurs twice is `ambiguous`.
 */
export function resolveLocalTime(wall: string, timeZone: string): LocalTimeResolution {
  if (!isLocalWallTime(wall)) {
    return { kind: "malformed" };
  }
  if (!isValidTimeZone(timeZone)) {
    return { kind: "invalid-time-zone" };
  }
  const match = LOCAL_WALL_TIME.exec(wall);
  if (match === null) {
    return { kind: "malformed" };
  }
  const asUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  const candidates: number[] = [];
  for (const probe of [asUtc - MS_PER_DAY, asUtc + MS_PER_DAY]) {
    const offset = offsetAt(probe, timeZone);
    if (offset === undefined) {
      continue;
    }
    const candidate = asUtc - offset;
    if (candidates.includes(candidate)) {
      continue;
    }
    const parts = wallParts(candidate, timeZone);
    if (parts !== undefined && renderMinute(parts) === wall) {
      candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => a - b);
  const [earlier, later] = candidates;
  if (earlier === undefined) {
    return { kind: "nonexistent" };
  }
  if (later === undefined) {
    return { kind: "ok", epochMs: earlier };
  }
  return { kind: "ambiguous", earlierEpochMs: earlier, laterEpochMs: later };
}
