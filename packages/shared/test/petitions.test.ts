import { describe, expect, it } from 'vitest';
import {
  aggregateVotes,
  makePetitionId,
  PETITION_LIMITS,
  petitionProblem,
  sanitizeBody,
  sanitizeTitle,
  validatePetitionInput,
  validateVote,
  voteDocId,
} from '../src/index.js';

describe('petition validation', () => {
  const good = {
    id: 'pet_abc123_xyz789',
    category: 'bugs' as const,
    title: 'Carnifex zbyt szybki',
    body: 'Na fali 5 Carnifex dogania sprint. Proszę o nerf prędkości szarży.',
    name: 'Filip',
    gameVersion: '0.6.1',
    source: 'live' as const,
  };

  it('accepts a well-formed petition', () => {
    const v = validatePetitionInput(good);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.title).toBe(good.title);
  });

  it('strips/rejects control chars exactly at range boundaries', () => {
    const bodyAllowed = new Set([0x09, 0x0a, 0x0d]);
    const codes = [
      0x00, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x1f, 0x20, 0x7e, 0x7f, 0x80, 0xa0,
    ];
    for (const c of codes) {
      const ch = String.fromCharCode(c);
      const ctrl = c <= 0x1f || c === 0x7f;
      const ws = /\s/.test(ch);
      // Title: whitespace collapses to ' ' first, then every C0 control + DEL is removed.
      expect(sanitizeTitle(`a${ch}b`)).toBe(ws ? 'a b' : ctrl ? 'ab' : `a${ch}b`);
      // Body: tab/LF/CR survive (CR kept when lone), other controls + DEL removed.
      expect(sanitizeBody(`a${ch}b`)).toBe(ctrl && !bodyAllowed.has(c) ? 'ab' : `a${ch}b`);
      const rawTitle = `Carnifex${ch}zbyt szybki`;
      const rawBody = `${good.body}${ch}koniec`;
      const title = validatePetitionInput({ ...good, title: rawTitle });
      const body = validatePetitionInput({ ...good, body: rawBody });
      expect(title.ok && title.value.title).toBe(sanitizeTitle(rawTitle));
      expect(body.ok && body.value.body).toBe(sanitizeBody(rawBody));
      // Unsanitized check: tab/LF/CR allowed, other C0 controls + DEL rejected.
      const bad = ctrl && !bodyAllowed.has(c);
      expect(petitionProblem({ ...good, title: rawTitle })).toBe(bad ? 'BAD_TITLE' : null);
      expect(petitionProblem({ ...good, body: rawBody })).toBe(bad ? 'BAD_BODY' : null);
    }
    expect(sanitizeTitle(' <x>\t\u0000y ')).toBe('x y');
    expect(sanitizeBody('a \t\r\nb\u0007<c>\n\n\n\nd')).toBe('a\nbc\n\nd');
  });

  it('sanitizes title/body and rejects empties / overlong', () => {
    expect(sanitizeTitle('  foo\nbar  ')).toBe('foo bar');
    expect(sanitizeBody('a\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeTitle('x'.repeat(PETITION_LIMITS.titleMaxLength + 5)).length).toBe(
      PETITION_LIMITS.titleMaxLength,
    );
    expect(validatePetitionInput({ ...good, title: '' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, body: '' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, category: 'nope' as 'bugs' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, source: 'staging' as 'live' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, name: 'xXfuckXx' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, id: 'x' }).ok).toBe(false);
  });

  it('stamps makePetitionId in the allowed pattern', () => {
    expect(PETITION_LIMITS.petitionIdPattern.test(makePetitionId())).toBe(true);
  });
});

describe('petition votes', () => {
  const petitionId = 'pet_abc123_xyz789';
  const voterId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('requires doc id petitionId_voterId and ±1/0 value', () => {
    const id = voteDocId(petitionId, voterId);
    expect(validateVote(id, { petitionId, voterId, value: 1 }).ok).toBe(true);
    expect(validateVote(id, { petitionId, voterId, value: 0 }).ok).toBe(true);
    expect(validateVote(id, { petitionId, voterId, value: 2 as 1 }).ok).toBe(false);
    expect(validateVote('wrong', { petitionId, voterId, value: 1 }).ok).toBe(false);
  });

  it('aggregates score and tracks myVote (0 ignored in totals)', () => {
    const votes = [
      { voterId: 'a', value: 1 as const },
      { voterId: 'b', value: 1 as const },
      { voterId: 'c', value: -1 as const },
      { voterId: 'd', value: 0 as const },
      { voterId: 'me', value: 1 as const },
    ];
    expect(aggregateVotes(votes, 'me')).toEqual({ score: 2, up: 3, down: 1, myVote: 1 });
    expect(aggregateVotes(votes, 'missing').myVote).toBe(0);
  });

  it('flip semantics: same vote → clear to 0', () => {
    // UI logic mirrored for the unit test.
    const next = (my: 1 | -1 | 0, want: 1 | -1) => (my === want ? 0 : want);
    expect(next(0, 1)).toBe(1);
    expect(next(1, 1)).toBe(0);
    expect(next(1, -1)).toBe(-1);
    expect(next(-1, -1)).toBe(0);
  });
});
