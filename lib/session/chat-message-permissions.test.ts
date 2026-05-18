import { describe, expect, it } from 'vitest';
import { canPostSessionChatMessage } from './chat-message-permissions';

describe('canPostSessionChatMessage', () => {
  it('allows participant player messages', () => {
    expect(
      canPostSessionChatMessage({
        hasSessionAccess: true,
        isSessionGm: false,
        type: 'player',
      }),
    ).toBe(true);
  });

  it('blocks nonparticipant player messages', () => {
    expect(
      canPostSessionChatMessage({
        hasSessionAccess: false,
        isSessionGm: false,
        type: 'player',
      }),
    ).toBe(false);
  });

  it('blocks non-GM narration', () => {
    expect(
      canPostSessionChatMessage({
        hasSessionAccess: true,
        isSessionGm: false,
        type: 'narration',
      }),
    ).toBe(false);
  });

  it('allows GM narration', () => {
    expect(
      canPostSessionChatMessage({
        hasSessionAccess: true,
        isSessionGm: true,
        type: 'narration',
      }),
    ).toBe(true);
  });
});
