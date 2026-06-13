import { Session, type ResolveEvent, type SessionHooks } from '../src/engine/session';

export interface Harness {
  session: Session;
  events: ResolveEvent[];
  warns: number[];
  stormCompletes: number[];
  /** RNG queue: values are consumed in order; falls back to `fallback` (default 0). */
  rngQueue: number[];
}

export function makeHarness(rngFallback = 0): Harness {
  const events: ResolveEvent[] = [];
  const warns: number[] = [];
  const stormCompletes: number[] = [];
  const rngQueue: number[] = [];
  const rng = () => (rngQueue.length > 0 ? rngQueue.shift()! : rngFallback);
  const hooks: SessionHooks = {
    onResolve: (ev) => events.push(ev),
    onWarn: (now) => warns.push(now),
    onStormComplete: (checks) => stormCompletes.push(checks),
  };
  const session = new Session(() => ({ w: 800, h: 420 }), rng, hooks);
  return { session, events, warns, stormCompletes, rngQueue };
}

/**
 * Tick the session forward in fixed steps until a check is active (or the
 * deadline passes). Returns the clock value after the spawning tick.
 */
export function tickUntilActive(h: Harness, from: number, stepMs = 25, maxMs = 30000): number {
  let now = from;
  while (h.session.phase !== 'active') {
    now += stepMs;
    if (now - from > maxMs) throw new Error(`no check became active within ${maxMs}ms`);
    h.session.tick(now);
  }
  return now;
}

/** Time at which the pointer reaches the great-zone center of the active check. */
export function greatCenterTime(h: Harness): number {
  const c = h.session.check;
  if (!c) throw new Error('no active check');
  return c.t0 + (c.zoneStartDeg + c.greatDeg / 2) / c.degPerMs;
}

/** Time at which the pointer reaches the middle of the good zone (after great). */
export function goodCenterTime(h: Harness): number {
  const c = h.session.check;
  if (!c) throw new Error('no active check');
  return c.t0 + (c.zoneStartDeg + c.greatDeg + c.goodDeg / 2) / c.degPerMs;
}
