import { sanitizeName } from '../highscore/limits.js';
import { nameProblem } from '../highscore/names.js';
import {
  PETITION_CATEGORIES,
  PETITION_LIMITS as L,
  PETITION_SOURCES,
  PETITION_STATUSES,
  PETITION_VOTE_VALUES,
  type PetitionCategory,
  type PetitionSource,
  type PetitionStatus,
  type PetitionVoteValue,
} from './limits.js';
import type { PetitionInput, PetitionVote } from './types.js';

export type PetitionProblem =
  | 'BAD_ID'
  | 'BAD_CATEGORY'
  | 'BAD_TITLE'
  | 'BAD_BODY'
  | 'BAD_NAME'
  | 'BAD_VERSION'
  | 'BAD_SOURCE'
  | 'BAD_STATUS';

export function isPetitionCategory(v: unknown): v is PetitionCategory {
  return typeof v === 'string' && (PETITION_CATEGORIES as readonly string[]).includes(v);
}

export function isPetitionSource(v: unknown): v is PetitionSource {
  return typeof v === 'string' && (PETITION_SOURCES as readonly string[]).includes(v);
}

export function isPetitionStatus(v: unknown): v is PetitionStatus {
  return typeof v === 'string' && (PETITION_STATUSES as readonly string[]).includes(v);
}

export function isPetitionVoteValue(v: unknown): v is PetitionVoteValue {
  return typeof v === 'number' && (PETITION_VOTE_VALUES as readonly number[]).includes(v);
}

/** C0 controls (U+0000–U+001F) and DEL (U+007F). */
const isControl = (c: number) => c <= 0x1f || c === 0x7f;
/** Controls except tab (U+0009), LF (U+000A) and CR (U+000D). */
const isBodyControl = (c: number) => isControl(c) && c !== 0x09 && c !== 0x0a && c !== 0x0d;
const hasChar = (s: string, bad: (c: number) => boolean) => {
  for (let i = 0; i < s.length; i++) if (bad(s.charCodeAt(i))) return true;
  return false;
};
/** Drops chars matching `bad` plus '<' and '>'. */
const stripChars = (s: string, bad: (c: number) => boolean) => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!bad(c) && c !== 0x3c && c !== 0x3e) out += s[i];
  }
  return out;
};

const titleOk = (s: string) =>
  s.length >= L.titleMinLength && s.length <= L.titleMaxLength && !hasChar(s, isBodyControl);

const bodyOk = (s: string) =>
  s.length >= L.bodyMinLength && s.length <= L.bodyMaxLength && !hasChar(s, isBodyControl);

/** NFC + collapse spaces (title) / keep newlines in body, strip controls, length-cap. */
export function sanitizeTitle(raw: string): string {
  return stripChars(raw.normalize('NFC').replace(/\s+/g, ' '), isControl)
    .trim()
    .slice(0, L.titleMaxLength);
}

export function sanitizeBody(raw: string): string {
  return stripChars(raw.normalize('NFC').replace(/\r\n/g, '\n'), isBodyControl)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, L.bodyMaxLength);
}

export function petitionProblem(
  p: Partial<PetitionInput> & { status?: string },
): PetitionProblem | null {
  if (typeof p.id !== 'string' || !L.petitionIdPattern.test(p.id)) return 'BAD_ID';
  if (!isPetitionCategory(p.category)) return 'BAD_CATEGORY';
  if (typeof p.title !== 'string' || !titleOk(p.title)) return 'BAD_TITLE';
  if (typeof p.body !== 'string' || !bodyOk(p.body)) return 'BAD_BODY';
  if (typeof p.name !== 'string' || nameProblem(p.name) !== null) return 'BAD_NAME';
  if (typeof p.gameVersion !== 'string' || !L.versionPattern.test(p.gameVersion))
    return 'BAD_VERSION';
  if (!isPetitionSource(p.source)) return 'BAD_SOURCE';
  if (p.status !== undefined && p.status !== 'open') return 'BAD_STATUS';
  return null;
}

export function validatePetitionInput(
  raw: Partial<PetitionInput>,
): { ok: true; value: PetitionInput } | { ok: false; error: PetitionProblem } {
  const value: PetitionInput = {
    id: typeof raw.id === 'string' ? raw.id : '',
    category: raw.category as PetitionCategory,
    title: typeof raw.title === 'string' ? sanitizeTitle(raw.title) : '',
    body: typeof raw.body === 'string' ? sanitizeBody(raw.body) : '',
    name: typeof raw.name === 'string' ? sanitizeName(raw.name) : '',
    gameVersion: typeof raw.gameVersion === 'string' ? raw.gameVersion.trim() : '',
    source: raw.source as PetitionSource,
  };
  const error = petitionProblem({ ...value, status: 'open' });
  return error ? { ok: false, error } : { ok: true, value };
}

export type VoteProblem = 'BAD_ID' | 'BAD_PETITION' | 'BAD_VOTER' | 'BAD_VALUE';

export function voteDocId(petitionId: string, voterId: string): string {
  return `${petitionId}_${voterId}`;
}

export function voteProblem(voteId: string, v: Partial<PetitionVote>): VoteProblem | null {
  if (typeof v.petitionId !== 'string' || !L.petitionIdPattern.test(v.petitionId))
    return 'BAD_PETITION';
  if (typeof v.voterId !== 'string' || !L.voterIdPattern.test(v.voterId)) return 'BAD_VOTER';
  if (!isPetitionVoteValue(v.value)) return 'BAD_VALUE';
  if (voteId !== voteDocId(v.petitionId, v.voterId)) return 'BAD_ID';
  return null;
}

export function validateVote(
  voteId: string,
  raw: Partial<PetitionVote>,
): { ok: true; value: PetitionVote } | { ok: false; error: VoteProblem } {
  const value: PetitionVote = {
    petitionId: typeof raw.petitionId === 'string' ? raw.petitionId : '',
    voterId: typeof raw.voterId === 'string' ? raw.voterId.toLowerCase() : '',
    value: raw.value as PetitionVoteValue,
  };
  const error = voteProblem(voteId, value);
  return error ? { ok: false, error } : { ok: true, value };
}

/** Aggregate votes for one petition. Cleared (0) votes do not count. */
export function aggregateVotes(
  votes: readonly Pick<PetitionVote, 'value' | 'voterId'>[],
  voterId: string,
): { score: number; up: number; down: number; myVote: PetitionVoteValue } {
  let up = 0;
  let down = 0;
  let myVote: PetitionVoteValue = 0;
  for (const v of votes) {
    if (v.value === 1) up++;
    else if (v.value === -1) down++;
    if (v.voterId.toLowerCase() === voterId.toLowerCase()) myVote = v.value;
  }
  return { score: up - down, up, down, myVote };
}

export function makePetitionId(rand: () => number = Math.random): string {
  const t = Date.now().toString(36);
  let r = '';
  for (let i = 0; i < 10; i++) r += Math.floor(rand() * 36).toString(36);
  return `pet_${t}_${r}`;
}
