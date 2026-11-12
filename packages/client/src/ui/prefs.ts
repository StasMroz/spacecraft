import { findMission } from '@sms/shared';
import { storage } from '../util/storage.js';

/**
 * Preferences shared by every deployed version (same github.io origin):
 * name (`sms.name`), mute (`sms.muted`), the preferred chapter, and the last
 * mission. Highscore tables are per leaderboard board instead
 * (see highscores/LocalHighscoreStore.ts).
 */
const CHAPTER_KEY = 'sms.chapter';
const MISSION_KEY = 'sms.mission';

export const prefs = {
  chapter: (): string | undefined => storage.get<string>(CHAPTER_KEY, '') || undefined,
  setChapter: (id: string): void => storage.set(CHAPTER_KEY, id),
  /** Last chosen catalogue id, if it is still a known mission. */
  mission: (): string | undefined => findMission(storage.get<string>(MISSION_KEY, ''))?.id,
  setMission: (id: string): void => {
    if (findMission(id)) storage.set(MISSION_KEY, id);
  },
};
