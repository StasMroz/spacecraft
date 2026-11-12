/**
 * Generates firestore.rules from the shared limits and name rules (`npm run rules`), so the
 * Firestore leaderboard enforces exactly what the client validates. A test fails if the
 * committed firestore.rules is stale.
 */
import { DIRECTOR } from '../data/director.js';
import {
  FIRESTORE_PETITIONS,
  FIRESTORE_PETITION_VOTES,
  PETITION_CATEGORIES,
  PETITION_FIELDS,
  PETITION_LIMITS as P,
  PETITION_SOURCES,
  PETITION_VOTE_FIELDS,
} from '../petitions/limits.js';
import { HIGHSCORE_LIMITS as L } from './limits.js';
import { NAME_PATTERN_SOURCE, RUDE_SUBSTRINGS, RUDE_WORDS } from './names.js';
import { RUN_MODES } from './validation.js';
import { FIRESTORE_DUEL_MATCHES, FIRESTORE_DUEL_RATINGS } from './duel.js';

export const FIRESTORE_COLLECTION = 'highscores';
/**
 * Per-version leaderboards: runs live in `boards/{board}/highscores/{runId}` where board is the
 * game's major.minor ("0.2"), so every content/balance release starts with an empty board while
 * frozen older builds keep theirs. The top-level `highscores` collection is the legacy v0.1.x
 * board (written by the frozen /v0.1.0/ build), which stays readable and writable as before.
 * Same collection id, so the existing composite index (teamSize ASC, survivalMs DESC) serves
 * every board.
 */
export const FIRESTORE_BOARDS = 'boards';
/**
 * From this version on every release gets its own board keyed by the full version
 * ("0.5.1"), so even a patch release starts with an empty table. Earlier versions keep their
 * major.minor boards ("0.5" = v0.5.0, "0.4" = v0.4.x).
 */
export const PATCH_BOARDS_FROM: readonly [number, number, number] = [0, 5, 1];
/**
 * Releases that keep writing the previous board instead of opening a fresh table.
 * Key = full game version (no -tag); value = existing boards/ id. Published Firestore rules are
 * unchanged: writes still need version.split("[-+]")[0] == board, so aliased builds stamp
 * `leaderboardRunVersion` (e.g. 0.6.1 → board 0.6.0, run version "0.6.0-0.6.1").
 */
export const BOARD_ALIASES: Readonly<Record<string, string>> = {
  '0.6.1': '0.6.0',
};
/** Board id for a game version: "0.2.3" → "0.2", "0.5.0" → "0.5", "0.5.1(-x)" → "0.5.1". */
export function leaderboardBoard(version: string): string {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})/.exec(version);
  if (!m) throw new Error(`bad version ${version}`);
  const full = `${m[1]}.${m[2]}.${m[3]}`;
  if (BOARD_ALIASES[full]) return BOARD_ALIASES[full];
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [a, b, c] = PATCH_BOARDS_FROM;
  const patchBoard = v[0] !== a ? v[0] > a : v[1] !== b ? v[1] > b : v[2] >= c;
  return patchBoard ? full : `${v[0]}.${v[1]}`;
}
/**
 * `version` field for a Firestore write. When the release aliases onto an older board, stamp a
 * single -tag so published boardVersion() and versionPattern both accept the doc (pattern allows
 * only one hyphenated tag). Examples: "0.6.1" → "0.6.0-0.6.1", "0.6.1-test" → "0.6.0-test"
 * (stays hidden); "0.6.0" / "0.6.0-test" unchanged.
 */
export function leaderboardRunVersion(version: string): string {
  const board = leaderboardBoard(version);
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})(?:-([0-9A-Za-z.]{1,12}))?$/.exec(version);
  if (!m) throw new Error(`bad version ${version}`);
  const release = m[1];
  const tag = m[2];
  if (version.split(/[-+]/)[0] === board) return version;
  // One -suffix only. Prefer board-release; -test (and other tags) collapse to board-<tag>.
  if (!tag) return `${board}-${release}`;
  return `${board}-${tag}`;
}
/** Fields of a legacy (v0.1.x, top-level collection) run. */
export const FIRESTORE_LEGACY_FIELDS = [
  'teamSize',
  'names',
  'survivalMs',
  'kills',
  'wave',
  'mode',
  'version',
  'timestamp',
] as const;
/** Fields of a v0.2/v0.3 per-board run: the legacy set + `board` (must equal the path segment). */
export const FIRESTORE_BOARD_FIELDS = [...FIRESTORE_LEGACY_FIELDS, 'board'] as const;
/** Boards written by frozen builds from before personal scores (v0.2.x, v0.3.x). */
export const FIRESTORE_SCORELESS_BOARDS = ['0.2', '0.3'] as const;
/** Fields of a v0.4+ run: + per-marine points and kills, aligned with `names`. */
export const FIRESTORE_FIELDS = [...FIRESTORE_BOARD_FIELDS, 'playerScores', 'playerKills'] as const;
/**
 * Individual leaderboard (v0.4+): one doc per marine per run in `boards/{board}/scores/{runId}-{slot}`,
 * written in the same commit as the run and checked against it with getAfter().
 */
export const FIRESTORE_SCORES = 'scores';
export const FIRESTORE_SCORE_FIELDS = [
  'runId',
  'slot',
  'name',
  'score',
  'kills',
  'teamSize',
  'survivalMs',
  'version',
  'board',
  'timestamp',
] as const;
/** Firestore composite indexes the leaderboard queries need (also in firestore.indexes.json). */
export const FIRESTORE_INDEXES = {
  indexes: [
    {
      collectionGroup: FIRESTORE_COLLECTION,
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'teamSize', order: 'ASCENDING' },
        { fieldPath: 'survivalMs', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: FIRESTORE_SCORES,
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'teamSize', order: 'ASCENDING' },
        { fieldPath: 'score', order: 'DESCENDING' },
      ],
    },
  ],
  fieldOverrides: [],
};

/** A regex source → a rules string literal ("..." with \ and " escaped). */
const lit = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const unanchored = (r: RegExp) => r.source.replace(/^\^/, '').replace(/\$$/, '');

export function buildFirestoreRules(): string {
  const list = (fs: readonly string[]) => fs.map((f) => `'${f}'`).join(', ');
  const fields = list(FIRESTORE_FIELDS);
  const boardFields = list(FIRESTORE_BOARD_FIELDS);
  const legacy = list(FIRESTORE_LEGACY_FIELDS);
  const scoreFields = list(FIRESTORE_SCORE_FIELDS);
  const scoreless = list(FIRESTORE_SCORELESS_BOARDS);
  const petitionFields = list(PETITION_FIELDS);
  const voteFields = list(PETITION_VOTE_FIELDS);
  const categories = PETITION_CATEGORIES.map((c) => `'${c}'`).join(', ');
  const sources = PETITION_SOURCES.map((s) => `'${s}'`).join(', ');
  const perMarine = Array.from(
    { length: L.maxTeamSize },
    (_, i) => `        && (d.teamSize <= ${i} || validMarine(d, ${i}))`,
  ).join('\n');
  const pts = L.maxPointsPerSecondPerPlayer;
  const nameChecks = Array.from(
    { length: L.maxTeamSize },
    (_, i) => `        && (d.names.size() <= ${i} || validName(d.names[${i}]))`,
  ).join('\n');
  const firstMs = DIRECTOR.waves.firstDelay * 1000;
  const breatherMs = DIRECTOR.waves.breather * 1000;
  const k = L.maxKillsPerSecondPerPlayer;
  return `rules_version = '2';

// GENERATED by \`npm run rules\` from packages/shared/src/highscore + petitions.
// Do not edit by hand. Public read; create-only highscores; petitions + votes; 1v1 duel matches/ratings.
service cloud.firestore {
  match /databases/{database}/documents {

    function validName(name) {
      return name is string
        && name.size() >= ${L.nameMinLength} && name.size() <= ${L.nameMaxLength}
        && name.matches(${lit(NAME_PATTERN_SOURCE)})
        && !name.lower().replace('[^a-z]', '').matches(${lit(`.*(${RUDE_SUBSTRINGS.join('|')}).*`)})
        && !name.lower().matches(${lit(`(.*[^a-z])?(${RUDE_WORDS.join('|')})s?([^a-z].*)?`)});
    }

    function validRun(runId, d) {
      return runId.matches(${lit(unanchored(L.runIdPattern))})
        && d.teamSize is int && d.teamSize >= ${L.minTeamSize} && d.teamSize <= ${L.maxTeamSize}
        && d.names is list && d.names.size() == d.teamSize
${nameChecks}
        && d.survivalMs is int && d.survivalMs >= ${L.minSurvivalMs} && d.survivalMs <= ${L.maxSurvivalMs}
        && d.kills is int && d.kills >= 0 && d.kills <= ${L.maxKills}
        && d.kills * 1000 <= d.survivalMs * ${k} * d.teamSize + ${L.killsSlack * 1000}
        && d.wave is int && d.wave >= 0 && d.wave <= ${L.maxWave}
        && (d.wave <= 1 || (d.wave - 1) * ${breatherMs} <= d.survivalMs - ${firstMs})
        && d.mode in [${RUN_MODES.map((m) => `'${m}'`).join(', ')}]
        && d.version is string && d.version.matches(${lit(unanchored(L.versionPattern))})
        && d.timestamp == request.time;
    }

    // v0.4+: per-marine points / kills (personal score = sum of kill points).
    function validMarine(d, i) {
      return d.playerScores[i] is int && d.playerScores[i] >= 0
        && d.playerScores[i] * 1000 <= d.survivalMs * ${pts} + ${L.pointsSlack * 1000}
        && d.playerKills[i] is int && d.playerKills[i] >= 0 && d.playerKills[i] <= d.kills
        && d.playerKills[i] * 1000 <= d.survivalMs * ${k} + ${L.killsSlack * 1000};
    }

    function validScores(d) {
      return d.playerScores is list && d.playerScores.size() == d.teamSize
        && d.playerKills is list && d.playerKills.size() == d.teamSize
${perMarine};
    }

    function validBoard(board) {
      return board.matches("[0-9]{1,3}[.][0-9]{1,3}([.][0-9]{1,3})?");
    }

    // major.minor boards (v0.2 .. v0.5.0) take every patch of that minor; full-version boards
    // (v0.5.1+, e.g. boards/0.5.1) only that exact version (a -suffix such as -test allowed).
    function boardVersion(board, d) {
      return d.board == board
        && d.version is string
        && d.version.split('[.]').size() >= 3
        && ((board.matches("[0-9]{1,3}[.][0-9]{1,3}")
            && d.version.split('[.]')[0] + '.' + d.version.split('[.]')[1] == board)
          || (board.matches("[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}")
            && d.version.split('[-+]')[0] == board));
    }

    // An individual score row must mirror its run, written in the same commit.
    function validScoreRow(board, scoreId, d) {
      let run = getAfter(/databases/$(database)/documents/${FIRESTORE_BOARDS}/$(board)/${FIRESTORE_COLLECTION}/$(d.runId)).data;
      return d.slot is int && d.slot >= 0 && d.slot < ${L.maxTeamSize}
        && d.runId is string && scoreId == d.runId + '-' + string(d.slot)
        && d.timestamp == request.time
        && run.timestamp == request.time
        && d.slot < run.teamSize
        && d.teamSize == run.teamSize
        && d.name == run.names[d.slot]
        && d.score == run.playerScores[d.slot]
        && d.kills == run.playerKills[d.slot]
        && d.survivalMs == run.survivalMs
        && d.version == run.version;
    }

    // Legacy v0.1.x board (frozen /v0.1.0/ build): unchanged field set, no board field.
    match /${FIRESTORE_COLLECTION}/{runId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly([${legacy}])
        && request.resource.data.keys().hasAll([${legacy}])
        && validRun(runId, request.resource.data);
      allow update, delete: if false;
    }

    // Per-version boards (v0.2+): boards/0.4/highscores (major.minor, up to v0.5.0), then one
    // board per release from v0.5.1: boards/0.5.1/highscores.
    // v0.2/v0.3 (frozen builds) keep their field set; v0.4+ runs carry per-marine scores.
    match /${FIRESTORE_BOARDS}/{board}/${FIRESTORE_COLLECTION}/{runId} {
      allow read: if validBoard(board);
      allow create: if validBoard(board)
        && boardVersion(board, request.resource.data)
        && validRun(runId, request.resource.data)
        && ((board in [${scoreless}]
            && request.resource.data.keys().hasOnly([${boardFields}])
            && request.resource.data.keys().hasAll([${boardFields}]))
          || (!(board in [${scoreless}])
            && request.resource.data.keys().hasOnly([${fields}])
            && request.resource.data.keys().hasAll([${fields}])
            && validScores(request.resource.data)));
      allow update, delete: if false;
    }

    // Individual leaderboard (v0.4+): boards/{board}/scores/{runId}-{slot}.
    match /${FIRESTORE_BOARDS}/{board}/${FIRESTORE_SCORES}/{scoreId} {
      allow read: if validBoard(board);
      allow create: if validBoard(board)
        && !(board in [${scoreless}])
        && request.resource.data.keys().hasOnly([${scoreFields}])
        && request.resource.data.keys().hasAll([${scoreFields}])
        && boardVersion(board, request.resource.data)
        && validScoreRow(board, scoreId, request.resource.data);
      allow update, delete: if false;
    }

    // Vox Relay (feedback): top-level petitions + petitionVotes — not under boards/{version}.
    // Clients create status=='open' petitions and ±1/0 votes; status edits are console-only.
    function validPetitionId(id) {
      return id.matches(${lit(unanchored(P.petitionIdPattern))});
    }

    function validVoterId(id) {
      return id.matches(${lit(unanchored(P.voterIdPattern))});
    }

    function validPetition(d) {
      return d.category in [${categories}]
        && d.title is string && d.title.size() >= ${P.titleMinLength} && d.title.size() <= ${P.titleMaxLength}
        && d.body is string && d.body.size() >= ${P.bodyMinLength} && d.body.size() <= ${P.bodyMaxLength}
        && validName(d.name)
        && d.gameVersion is string && d.gameVersion.matches(${lit(unanchored(P.versionPattern))})
        && d.source in [${sources}]
        && d.status == 'open'
        && d.createdAt == request.time;
    }

    match /${FIRESTORE_PETITIONS}/{petitionId} {
      allow read: if true;
      allow create: if validPetitionId(petitionId)
        && request.resource.data.keys().hasOnly([${petitionFields}])
        && request.resource.data.keys().hasAll([${petitionFields}])
        && validPetition(request.resource.data);
      allow update, delete: if false;
    }

    match /${FIRESTORE_PETITION_VOTES}/{voteId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly([${voteFields}])
        && request.resource.data.keys().hasAll([${voteFields}])
        && validPetitionId(request.resource.data.petitionId)
        && validVoterId(request.resource.data.voterId)
        && voteId == request.resource.data.petitionId + '_' + request.resource.data.voterId
        && request.resource.data.value in [1, -1]
        && exists(/databases/$(database)/documents/${FIRESTORE_PETITIONS}/$(request.resource.data.petitionId));
      allow update: if request.resource.data.keys().hasOnly([${voteFields}])
        && request.resource.data.keys().hasAll([${voteFields}])
        && resource.data.petitionId == request.resource.data.petitionId
        && resource.data.voterId == request.resource.data.voterId
        && voteId == resource.data.petitionId + '_' + resource.data.voterId
        && request.resource.data.value in [1, -1, 0];
      allow delete: if false;
    }

    // Ranked 1v1 duels: create-only match log (id = runId). Ratings may be denormalized
    // on duelRatings; clients can also replay matches. Does not touch boards/*/highscores.
    function validDuelMatch(matchId, d) {
      return matchId.matches(${lit(unanchored(L.runIdPattern))})
        && d.winner is string && validName(d.winner)
        && d.loser is string && validName(d.loser)
        && d.winner != d.loser
        && d.winnerKills is int && d.loserKills is int
        && d.winnerKills >= 2 && d.winnerKills <= ${L.maxKills}
        && d.loserKills >= 0 && d.loserKills < d.winnerKills
        && d.version is string && d.version.matches(${lit(unanchored(L.versionPattern))})
        && d.mode in ['p2p', 'dedicated']
        && d.timestamp == request.time;
    }

    match /${FIRESTORE_DUEL_MATCHES}/{matchId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['winner', 'loser', 'winnerKills', 'loserKills', 'version', 'mode', 'timestamp'])
        && request.resource.data.keys().hasAll(['winner', 'loser', 'winnerKills', 'loserKills', 'version', 'mode', 'timestamp'])
        && validDuelMatch(matchId, request.resource.data);
      allow update, delete: if false;
    }

    function validDuelRating(d) {
      return validName(d.name)
        && d.rating is int && d.rating >= 100 && d.rating <= 4000
        && d.wins is int && d.wins >= 0 && d.wins <= ${L.maxKills}
        && d.losses is int && d.losses >= 0 && d.losses <= ${L.maxKills}
        && d.wins + d.losses >= 1
        && d.timestamp == request.time;
    }

    match /${FIRESTORE_DUEL_RATINGS}/{playerId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['name', 'rating', 'wins', 'losses', 'timestamp'])
        && request.resource.data.keys().hasAll(['name', 'rating', 'wins', 'losses', 'timestamp'])
        && validDuelRating(request.resource.data);
      allow update: if request.resource.data.keys().hasOnly(['name', 'rating', 'wins', 'losses', 'timestamp'])
        && request.resource.data.keys().hasAll(['name', 'rating', 'wins', 'losses', 'timestamp'])
        && resource.data.name == request.resource.data.name
        && validDuelRating(request.resource.data);
      allow delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
}
