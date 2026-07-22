import { describe, expect, it } from 'vitest';
import { CompetitionTeamMember, OfficialCredential, SportRankAward } from './passport.js';

const ids = {
  officialProfileId: '10000000-0000-0000-0000-000000000001',
  credentialId: '10000000-0000-0000-0000-000000000002',
  athleteId: '10000000-0000-0000-0000-000000000003',
  rankId: '10000000-0000-0000-0000-000000000004',
  competitionId: '10000000-0000-0000-0000-000000000005',
  teamMemberId: '10000000-0000-0000-0000-000000000006',
  userId: '10000000-0000-0000-0000-000000000007',
};
const now = '2026-07-22T10:00:00.000Z';

describe('passport domain contracts', () => {
  it('rejects credentials and ranks that expire before issue', () => {
    const credential = OfficialCredential.safeParse({
      id: ids.credentialId,
      officialProfileId: ids.officialProfileId,
      kind: 'attestation',
      name: 'ISF attestation',
      credentialNumber: 'A-1',
      issuedByFederationId: null,
      issuedAt: now,
      expiresAt: '2026-07-21T10:00:00.000Z',
      status: 'active',
      documentAttachmentId: null,
      statusReason: null,
      createdAt: now,
      updatedAt: now,
    });
    const rank = SportRankAward.safeParse({
      id: ids.rankId,
      athleteId: ids.athleteId,
      name: 'Master of Sport',
      basis: 'Championship result',
      issuedByFederationId: null,
      issuedAt: now,
      expiresAt: '2026-07-21T10:00:00.000Z',
      status: 'active',
      documentAttachmentId: null,
      statusReason: null,
      createdAt: now,
      updatedAt: now,
    });

    expect(credential.success).toBe(false);
    expect(rank.success).toBe(false);
  });

  it('keeps team participation distinct from user permissions and links judge work explicitly', () => {
    const parsed = CompetitionTeamMember.parse({
      id: ids.teamMemberId,
      competitionId: ids.competitionId,
      userId: ids.userId,
      platformId: null,
      role: 'judge',
      status: 'completed',
      memberNameSnapshot: 'Ivan Ivanov',
      invitedAt: now,
      confirmedAt: now,
      completedAt: now,
      judgeAssignmentId: '10000000-0000-0000-0000-000000000008',
      correctionOfId: null,
      createdAt: now,
      updatedAt: now,
    });

    expect(parsed.role).toBe('judge');
    expect(parsed.judgeAssignmentId).toBeTruthy();
  });
});
