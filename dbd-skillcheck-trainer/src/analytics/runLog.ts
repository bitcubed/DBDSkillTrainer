// Run logging (spec §8.1): the snapshot/diff glue between a live Session and
// the persistent history. Extracted from main.ts so the "every run logged"
// behavior is headless-testable: a free-play run is Start→Stop with ≥10
// checks; Programs log on completion with their segment results. Reset
// mid-run intentionally discards the pre-reset stretch (reset = "wipe it").

import type { RunStats, SegmentResult, SessionRecord, Settings } from '../engine/types';
import {
  appendRecord,
  freeplayWorthLogging,
  makeSessionRecord,
  snapshotStats,
  type StatsSnapshot,
  type StorageLike,
} from './history';
import { errsSince } from './stats';

interface LiveRun {
  startedAtEpoch: number;
  startedPerf: number;
  snap: StatsSnapshot;
  settingsSnapshot: Partial<Settings>;
}

export class RunLogger {
  private run: LiveRun | null = null;

  constructor(private readonly storage: StorageLike) {}

  get active(): boolean {
    return this.run !== null;
  }

  /** Start tracking a free-play run. `errCountTotal` is the session's monotone error counter. */
  begin(
    stats: RunStats,
    errCountTotal: number,
    epochMs: number,
    perfNow: number,
    settingsSnapshot: Partial<Settings>,
  ): void {
    this.run = {
      startedAtEpoch: epochMs,
      startedPerf: perfNow,
      snap: snapshotStats(stats, errCountTotal),
      settingsSnapshot,
    };
  }

  /** Drop the live run without logging (e.g. reset mid-run discards the stretch). */
  discard(): void {
    this.run = null;
  }

  /**
   * Close out the free-play run. Returns the updated history when the run was
   * logged (≥10 checks), or null when there was nothing worth logging.
   */
  endFreeplay(stats: RunStats, errCountTotal: number, perfNow: number): SessionRecord[] | null {
    const run = this.run;
    if (!run) return null;
    this.run = null;
    const great = stats.great - run.snap.great;
    const good = stats.good - run.snap.good;
    const miss = stats.miss - run.snap.miss;
    if (!freeplayWorthLogging(great, good, miss)) return null;
    return appendRecord(
      makeSessionRecord({
        kind: 'freeplay',
        startedAt: run.startedAtEpoch,
        durationS: (perfNow - run.startedPerf) / 1000,
        great,
        good,
        miss,
        bestStreak: stats.best,
        errsMs: errsSince(stats.errs, errCountTotal, run.snap.errCount),
        settingsSnapshot: run.settingsSnapshot,
      }),
      this.storage,
    );
  }

  /** Log a completed Program (stats were reset at Program start, so they ARE the run). */
  logProgram(
    stats: RunStats,
    segments: SegmentResult[],
    epochMs: number,
    durationS: number,
    settingsSnapshot: Partial<Settings>,
  ): SessionRecord[] {
    return appendRecord(
      makeSessionRecord({
        kind: 'program',
        startedAt: epochMs,
        durationS,
        great: stats.great,
        good: stats.good,
        miss: stats.miss,
        bestStreak: stats.best,
        errsMs: stats.errs.map((e) => e.ms),
        segments,
        settingsSnapshot,
      }),
      this.storage,
    );
  }
}
