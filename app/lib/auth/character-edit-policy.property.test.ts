import fc from 'fast-check';
import { describe, it } from 'vitest';
import { characterRowEditableByUser } from '@/lib/auth/character-edit-policy';

describe('Property 29: Character ownership (edit policy mirrors RLS)', () => {
  it('owner may always edit their character row', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (viewerId, sessionCreatorId) => {
        fc.pre(viewerId !== sessionCreatorId);
        return (
          characterRowEditableByUser({
            viewerUserId: viewerId,
            characterUserId: viewerId,
            characterType: 'character',
            sessionCreatorId,
          }) === true
        );
      }),
      { numRuns: 50 },
    );
  });

  it('non-owner cannot edit another player character', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.uuid(), (viewerId, ownerId, sessionCreatorId) => {
        fc.pre(viewerId !== ownerId);
        return (
          characterRowEditableByUser({
            viewerUserId: viewerId,
            characterUserId: ownerId,
            characterType: 'character',
            sessionCreatorId,
          }) === false
        );
      }),
      { numRuns: 60 },
    );
  });

  it('only session creator may edit NPC rows (typical NPC user_id null)', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (viewerId, otherId) => {
        fc.pre(viewerId !== otherId);
        const creatorOk = characterRowEditableByUser({
          viewerUserId: viewerId,
          characterUserId: null,
          characterType: 'npc',
          sessionCreatorId: viewerId,
        });
        const otherDenied = characterRowEditableByUser({
          viewerUserId: otherId,
          characterUserId: null,
          characterType: 'npc',
          sessionCreatorId: viewerId,
        });
        return creatorOk === true && otherDenied === false;
      }),
      { numRuns: 50 },
    );
  });
});
