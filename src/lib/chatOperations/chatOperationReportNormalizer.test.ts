import { describe, expect, it } from 'vitest';
import { normalizeChatOperationReport } from './chatOperationReportNormalizer';

const CANONICAL_ROW = {
  id: 'row-1',
  operation_id: 'chat-c2184999-3378-46ab-8539-8be0678deced',
  sender_user_id: 'fb835d1f-db2f-4de4-84e2-ce0074512e46',
  game_id: '044eed54-6cb8-4b1a-a010-751616e9cecd',
  session_id: 'session:044eed54-6cb8-4b1a-a010-751616e9cecd',
  terminal_status: 'peer-received',
  report_text: 'CHAT SEND INCIDENT REPORT\n=========================\nOperation...',
  finalized_at: '2026-07-05T21:31:50.146661Z',
  report_json: {
    operation_type: 'chat_send',
    source_kind: 'real',
    sender_user_id: 'fb835d1f-db2f-4de4-84e2-ce0074512e46',
    started_at: '2026-07-05T21:31:44.631Z',
    completed_at: '2026-07-05T21:31:45.443307Z',
    identity: {
      route: '/game/044eed54-6cb8-4b1a-a010-751616e9cecd',
      game_id: '044eed54-6cb8-4b1a-a010-751616e9cecd',
      session_id: 'session:044eed54-6cb8-4b1a-a010-751616e9cecd',
      operation_id: 'chat-c2184999-3378-46ab-8539-8be0678deced',
    },
    counts: { snapshot_count: 22, peer_milestone_count: 5 },
    tab_attention_snapshots: new Array(22).fill({}),
    peer_milestones: new Array(5).fill({}),
  },
};

describe('normalizeChatOperationReport', () => {
  it('normalizes canonical nested report with identity.route (real chat-c218…)', () => {
    const n = normalizeChatOperationReport(CANONICAL_ROW as never);
    expect(n).not.toBeNull();
    expect(n!.route).toBe('/game/044eed54-6cb8-4b1a-a010-751616e9cecd');
    expect(n!.gameId).toBe('044eed54-6cb8-4b1a-a010-751616e9cecd');
    expect(n!.sessionId).toBe('session:044eed54-6cb8-4b1a-a010-751616e9cecd');
    expect(n!.operationId).toBe('chat-c2184999-3378-46ab-8539-8be0678deced');
    expect(n!.snapshotCount).toBe(22);
    expect(n!.peerMilestoneCount).toBe(5);
    expect(n!.operationType).toBe('chat_send');
    expect(n!.startedAt).toBe('2026-07-05T21:31:44.631Z');
  });

  it('supports legacy flat report shape (top-level route/counts)', () => {
    const legacy = {
      ...CANONICAL_ROW,
      report_json: {
        operation_type: 'chat_send',
        route: '/game/legacy-abc',
        game_id: 'legacy-abc',
        session_id: 'session:legacy-abc',
        operation_id: 'chat-legacy',
        started_at: '2026-07-05T21:31:44.631Z',
        snapshot_count: 3,
        peer_milestone_count: 2,
      },
      game_id: 'legacy-abc',
      session_id: 'session:legacy-abc',
      operation_id: 'chat-legacy',
    };
    const n = normalizeChatOperationReport(legacy as never);
    expect(n).not.toBeNull();
    expect(n!.route).toBe('/game/legacy-abc');
    expect(n!.snapshotCount).toBe(3);
    expect(n!.peerMilestoneCount).toBe(2);
  });

  it('prefers nested identity when both nested and flat are present', () => {
    const both = {
      ...CANONICAL_ROW,
      report_json: {
        ...CANONICAL_ROW.report_json,
        route: '/game/should-lose',
        game_id: 'should-lose',
      },
    };
    const n = normalizeChatOperationReport(both as never);
    expect(n!.route).toBe('/game/044eed54-6cb8-4b1a-a010-751616e9cecd');
    expect(n!.gameId).toBe('044eed54-6cb8-4b1a-a010-751616e9cecd');
  });

  it('rejects reports missing route identity', () => {
    const broken = {
      ...CANONICAL_ROW,
      report_json: { operation_type: 'chat_send', identity: {} },
    };
    expect(normalizeChatOperationReport(broken as never)).toBeNull();
  });

  it('rejects reports with empty report_text', () => {
    const broken = { ...CANONICAL_ROW, report_text: '' };
    expect(normalizeChatOperationReport(broken as never)).toBeNull();
  });
});
