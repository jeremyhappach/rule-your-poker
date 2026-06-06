/**
 * Wartime bridges — subscribe to existing instrumentation streams
 * (Startup Flight Recorder, Announcement Debug Log) and mirror their
 * events into the unified Wartime ring buffer.
 *
 * Bridges are attached lazily on first use and remain attached for the
 * page lifetime; they are no-ops while wartime is disabled or not
 * recording because recordWartime() short-circuits.
 */

import {
  getStartupFlightSnapshot,
  subscribeStartupFlight,
  type StartupFlightCategory,
  type StartupFlightEvent,
} from '@/lib/startupFlightRecorder';
import {
  getAnnouncementDebugEvents,
  subscribeAnnouncementDebug,
  type AnnouncementDebugEvent,
} from '@/lib/canonicalShell/announcements/announcementDebugLog';
import { recordWartime, type WartimeCategory } from './core';

let _attached = false;

function flightCategory(c: StartupFlightCategory, event: string): WartimeCategory {
  if (c === 'IDENTITY TIMELINE') return 'IDENTITY';
  if (c === 'MOUNT TIMELINE') return 'LIFECYCLE';
  if (c === 'RENDER TIMELINE') return 'RENDERING';
  if (c === 'REALTIME TIMELINE') return 'NETWORK';
  if (c === 'FETCH TIMELINE') return 'DATABASE';
  if (c === 'WRITE TIMELINE') return 'DATABASE';
  // Heuristic for [WAIT]-tagged chip / geometry events that still flow
  // through the flight recorder as PHASE/RENDER events.
  if (/chip-glyph|seatAnchor|ChipAnchor|geometry/i.test(event)) return 'GEOMETRY';
  if (/owner|ownership/i.test(event)) return 'OWNERSHIP';
  return 'LIFECYCLE';
}

function announcementCategory(ev: AnnouncementDebugEvent): WartimeCategory {
  const s = `${ev.kind} ${ev.summary}`.toLowerCase();
  if (/celebrat|confetti|skunk|match_win|round_win/.test(s)) return 'CELEBRATIONS';
  return 'ANNOUNCEMENTS';
}

export function attachWartimeBridges(): void {
  if (_attached) return;
  _attached = true;

  let lastFlightSeq = 0;
  const seenFlight = getStartupFlightSnapshot();
  if (seenFlight.length > 0) lastFlightSeq = seenFlight[seenFlight.length - 1].seq;

  subscribeStartupFlight(() => {
    const snap = getStartupFlightSnapshot();
    for (const ev of snap) {
      if (ev.seq <= lastFlightSeq) continue;
      lastFlightSeq = ev.seq;
      mirrorFlight(ev);
    }
  });

  let lastAnnSeq = 0;
  const seenAnn = getAnnouncementDebugEvents();
  if (seenAnn.length > 0) lastAnnSeq = seenAnn[seenAnn.length - 1].seq;

  subscribeAnnouncementDebug(() => {
    const snap = getAnnouncementDebugEvents();
    for (const ev of snap) {
      if (ev.seq <= lastAnnSeq) continue;
      lastAnnSeq = ev.seq;
      mirrorAnnouncement(ev);
    }
  });
}

function mirrorFlight(ev: StartupFlightEvent) {
  recordWartime(flightCategory(ev.category, ev.event), ev.event, {
    flightCategory: ev.category,
    deltaMs: ev.deltaMs,
    oldValue: ev.oldValue,
    newValue: ev.newValue,
    ...(ev.payload ?? {}),
  });
}

function mirrorAnnouncement(ev: AnnouncementDebugEvent) {
  recordWartime(announcementCategory(ev), `announcement.${ev.kind}: ${ev.summary}`, {
    repeat: ev.repeat,
    detail: ev.detail,
  });
}
