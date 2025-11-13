/**
 * Challenge Logger
 * Logs all challenges encountered during mining to JSONL file
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ChallengeEntry {
  ts: string;
  challenge_id: string;
  difficulty: string;
  no_pre_mine: string;
  latest_submission?: string;
  no_pre_mine_hour?: string;
  status: 'started' | 'completed' | 'skipped';
}

class ChallengeLogger {
  private challengesFile: string;

  constructor() {
    // Use same storage directory logic as receipts
    const oldStorageDir = path.join(process.cwd(), 'storage');
    const newDataDir = path.join(
      process.env.USERPROFILE || process.env.HOME || process.cwd(),
      'Documents',
      'MidnightFetcherBot'
    );

    let storageDir: string;

    // Check if receipts exist in old location (installation folder)
    const oldReceiptsFile = path.join(oldStorageDir, 'receipts.jsonl');
    if (fs.existsSync(oldReceiptsFile)) {
      storageDir = oldStorageDir;
    } else {
      storageDir = path.join(newDataDir, 'storage');
    }

    // Ensure storage directory exists
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.challengesFile = path.join(storageDir, 'challenges.jsonl');
    console.log(`[ChallengeLogger] Using: ${this.challengesFile}`);
  }

  /**
   * Log a challenge
   */
  logChallenge(challenge: ChallengeEntry): void {
    try {
      const line = JSON.stringify(challenge) + '\n';
      fs.appendFileSync(this.challengesFile, line, 'utf8');
    } catch (error: any) {
      console.error('[ChallengeLogger] Failed to log challenge:', error.message);
    }
  }

  /**
   * Read all challenges
   */
  readChallenges(): ChallengeEntry[] {
    try {
      if (!fs.existsSync(this.challengesFile)) {
        return [];
      }

      const content = fs.readFileSync(this.challengesFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error('[ChallengeLogger] Failed to parse challenge line:', line);
          return null;
        }
      }).filter(challenge => challenge !== null) as ChallengeEntry[];
    } catch (error: any) {
      console.error('[ChallengeLogger] Failed to read challenges:', error.message);
      return [];
    }
  }

  /**
   * Get all processed challenge IDs
   */
  getProcessedChallengeIds(): Set<string> {
    const challenges = this.readChallenges();
    return new Set(challenges.map(c => c.challenge_id));
  }

  /**
   * Check if a challenge has been processed (completed or has receipts)
   * Returns false for challenges that were only "started" but never completed
   */
  hasProcessedChallenge(challengeId: string): boolean {
    const challenges = this.readChallenges();

    // Check if this challenge has a "completed" status
    const hasCompleted = challenges.some(
      c => c.challenge_id === challengeId && c.status === 'completed'
    );

    if (hasCompleted) {
      return true;
    }

    // Also check if we have receipts for this challenge
    try {
      const { receiptsLogger } = require('./receipts-logger');
      const allReceipts = receiptsLogger.readReceipts();
      const hasReceipts = allReceipts.some((r: any) => r.challenge_id === challengeId);
      return hasReceipts;
    } catch (error) {
      // If we can't check receipts, just use completed status
      return false;
    }
  }
}

// Singleton instance
export const challengeLogger = new ChallengeLogger();
