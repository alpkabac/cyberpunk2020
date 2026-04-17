import fc from 'fast-check';
import { describe, it } from 'vitest';
import { sessionCreatorActionAuthorized } from '@/lib/auth/session-creator-policy';

describe('Property 30: Session creator permissions', () => {
  it('only the creator id matches for delete-style actions', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (creatorId, otherId) => {
        fc.pre(creatorId !== otherId);
        return (
          sessionCreatorActionAuthorized(creatorId, creatorId) === true &&
          sessionCreatorActionAuthorized(otherId, creatorId) === false
        );
      }),
      { numRuns: 50 },
    );
  });

  it('null creator denies everyone', () => {
    fc.assert(
      fc.property(fc.uuid(), (uid) => sessionCreatorActionAuthorized(uid, null) === false),
      { numRuns: 30 },
    );
  });
});
