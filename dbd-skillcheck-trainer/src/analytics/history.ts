// Persistent session log: every run (free-play and Program) appended to
// localStorage, capped, schema-versioned for forward migration. Storage is
// injected so all of this tests headless; corrupt or missing storage always
// degrades to an empty history, never a crash.

import type { RunStats, SegmentResult, SessionRecord, Settings } from '../engine/types';
import { greatRate, meanSd } from './stats';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const HISTORY_KEY = 'dbdtrainer.history.v1';
export const HISTORY_SCHEMA_VERSION = 1;
export const HISTORY_CAP = 500;
/** Free-play runs need at least this many checks to be logged (spec §8.1). */
export const FREEPLAY_MIN_CHECKS = 10;

interface HistoryFile {
  version: number;
  records: SessionRecord[];
}

function parseFile(raw: string | null): HistoryFile | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (
      v !== null &&
      typeof v === 'object' &&
      Array.isArray((v as HistoryFile).records) &&
      typeof (v as HistoryFile).version === 'number'
    ) {
      return v as HistoryFile;
    }
  } catch {
    // corrupt JSON → treat as missing
  }
  return null;
}

const isMsOrNull = (v: unknown): boolean => v === null || typeof v === 'number';

/** Shape-validate a stored record so JSON-valid garbage can't crash consumers. */
function isValidRecord(v: unknown): v is SessionRecord {
  if (v === null || typeof v !== 'object') return false;
  const r = v as SessionRecord;
  return (
    typeof r.startedAt === 'number' &&
    (r.kind === 'program' || r.kind === 'freeplay') &&
    typeof r.durationS === 'number' &&
    r.overall !== null &&
    typeof r.overall === 'object' &&
    typeof r.overall.great === 'number' &&
    typeof r.overall.good === 'number' &&
    typeof r.overall.miss === 'number' &&
    typeof r.overall.greatRate === 'number' &&
    typeof r.overall.bestStreak === 'number' &&
    isMsOrNull(r.overall.meanMs) &&
    isMsOrNull(r.overall.sdMs) &&
    (r.segments === undefined || Array.isArray(r.segments))
  );
}

/**
 * Load all records, oldest first. Corrupt/missing storage → empty list;
 * individually malformed records are dropped, never crash the dashboard.
 */
export function loadHistory(storage: StorageLike): SessionRecord[] {
  try {
    const records = parseFile(storage.getItem(HISTORY_KEY))?.records ?? [];
    return records.filter(isValidRecord);
  } catch {
    return [];
  }
}

export function saveHistory(records: SessionRecord[], storage: StorageLike): void {
  try {
    const file: HistoryFile = { version: HISTORY_SCHEMA_VERSION, records };
    storage.setItem(HISTORY_KEY, JSON.stringify(file));
  } catch {
    // quota exceeded / private mode — history is best-effort, never fatal
  }
}

/** Append a record, pruning the oldest past the cap. Returns the new list. */
export function appendRecord(record: SessionRecord, storage: StorageLike): SessionRecord[] {
  const records = loadHistory(storage);
  records.push(record);
  while (records.length > HISTORY_CAP) records.shift();
  saveHistory(records, storage);
  return records;
}

export function clearHistory(storage: StorageLike): void {
  try {
    storage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

export interface RunSummaryInput {
  kind: 'program' | 'freeplay';
  startedAt: number; // epoch ms
  durationS: number;
  great: number;
  good: number;
  miss: number;
  bestStreak: number;
  errsMs: readonly number[];
  segments?: SegmentResult[];
  settingsSnapshot: Partial<Settings>;
}

export function makeSessionRecord(i: RunSummaryInput): SessionRecord {
  const { mean, sd } = meanSd(i.errsMs);
  const record: SessionRecord = {
    id: `${i.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: i.startedAt,
    kind: i.kind,
    durationS: Math.round(i.durationS * 10) / 10,
    overall: {
      great: i.great,
      good: i.good,
      miss: i.miss,
      greatRate: greatRate(i.great, i.good, i.miss),
      meanMs: mean,
      sdMs: sd,
      bestStreak: i.bestStreak,
    },
    settingsSnapshot: i.settingsSnapshot,
  };
  if (i.segments) record.segments = i.segments;
  return record;
}

/** Should a free-play run be logged? (≥10 checks so trivia doesn't pollute history.) */
export function freeplayWorthLogging(great: number, good: number, miss: number): boolean {
  return great + good + miss >= FREEPLAY_MIN_CHECKS;
}

/** Snapshot of cumulative run stats, for diffing a free-play run at stop time. */
export interface StatsSnapshot {
  great: number;
  good: number;
  miss: number;
  errCount: number;
}

export function snapshotStats(stats: RunStats, errCount: number): StatsSnapshot {
  return { great: stats.great, good: stats.good, miss: stats.miss, errCount };
}
