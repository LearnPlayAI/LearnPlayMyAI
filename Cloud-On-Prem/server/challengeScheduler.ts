import { db } from './db';
import { challengeProgress, adminChallengeConfig } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Challenge Reset Scheduler
 * 
 * Automatically resets challenges based on their type:
 * - Daily challenges: Reset every day at 00:03
 * - Weekly challenges: Reset every Monday at 00:01
 * 
 * Runs every minute to check if it's time to reset
 */

class ChallengeScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60 * 1000; // Check every minute
  private lastDailyReset: Date | null = null;
  private lastWeeklyReset: Date | null = null;
  
  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.log('⏰ Challenge scheduler is already running');
      return;
    }
    
    console.log('⏰ Starting challenge scheduler...');
    
    // Run initial check
    this.checkResets().catch(err => {
      console.error('❌ Error in initial challenge reset check:', err);
    });
    
    // Schedule periodic checks every minute
    this.intervalId = setInterval(() => {
      this.checkResets().catch(err => {
        console.error('❌ Error in challenge scheduler:', err);
      });
    }, this.CHECK_INTERVAL);
    
    console.log('✅ Challenge scheduler started - checking every minute');
  }
  
  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏰ Challenge scheduler stopped');
    }
  }
  
  /**
   * Check if it's time to reset challenges
   */
  private async checkResets(): Promise<void> {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    try {
      // Check for daily reset at 00:03
      if (currentHour === 0 && currentMinute === 3) {
        // Prevent multiple resets in the same minute
        if (!this.lastDailyReset || this.isDifferentDay(this.lastDailyReset, now)) {
          await this.resetDailyChallenges();
          this.lastDailyReset = new Date(now);
        }
      }
      
      // Check for weekly reset on Monday at 00:01
      if (currentDay === 1 && currentHour === 0 && currentMinute === 1) {
        // Prevent multiple resets in the same minute
        if (!this.lastWeeklyReset || this.isDifferentWeek(this.lastWeeklyReset, now)) {
          await this.resetWeeklyChallenges();
          this.lastWeeklyReset = new Date(now);
        }
      }
    } catch (error) {
      console.error('❌ Error in challenge reset check:', error);
    }
  }
  
  /**
   * Reset all daily challenges
   */
  private async resetDailyChallenges(): Promise<void> {
    try {
      console.log('🔄 Resetting daily challenges...');
      
      // Get all daily challenges
      const dailyChallenges = await db
        .select()
        .from(adminChallengeConfig)
        .where(
          and(
            eq(adminChallengeConfig.challengeType, 'daily'),
            eq(adminChallengeConfig.isActive, true)
          )
        );
      
      if (dailyChallenges.length === 0) {
        console.log('⏰ No active daily challenges to reset');
        return;
      }
      
      // Calculate next reset time (tomorrow at 00:03)
      const nextReset = new Date();
      nextReset.setDate(nextReset.getDate() + 1);
      nextReset.setHours(0, 3, 0, 0);
      
      let resetCount = 0;
      
      // Reset progress for all users for each daily challenge
      for (const challenge of dailyChallenges) {
        const result = await db
          .update(challengeProgress)
          .set({
            currentValue: 0,
            isCompleted: false,
            isClaimed: false,
            completedAt: null,
            claimedAt: null,
            resetAt: nextReset,
            updatedAt: new Date(),
          })
          .where(eq(challengeProgress.challengeId, challenge.id));
        
        resetCount++;
      }
      
      console.log(`✅ Reset ${resetCount} daily challenges. Next reset: ${nextReset.toISOString()}`);
    } catch (error) {
      console.error('❌ Error resetting daily challenges:', error);
      throw error;
    }
  }
  
  /**
   * Reset all weekly challenges
   */
  private async resetWeeklyChallenges(): Promise<void> {
    try {
      console.log('🔄 Resetting weekly challenges...');
      
      // Get all weekly challenges
      const weeklyChallenges = await db
        .select()
        .from(adminChallengeConfig)
        .where(
          and(
            eq(adminChallengeConfig.challengeType, 'weekly'),
            eq(adminChallengeConfig.isActive, true)
          )
        );
      
      if (weeklyChallenges.length === 0) {
        console.log('⏰ No active weekly challenges to reset');
        return;
      }
      
      // Calculate next reset time (next Monday at 00:01)
      const nextReset = new Date();
      nextReset.setDate(nextReset.getDate() + 7);
      nextReset.setHours(0, 1, 0, 0);
      
      let resetCount = 0;
      
      // Reset progress for all users for each weekly challenge
      for (const challenge of weeklyChallenges) {
        const result = await db
          .update(challengeProgress)
          .set({
            currentValue: 0,
            isCompleted: false,
            isClaimed: false,
            completedAt: null,
            claimedAt: null,
            resetAt: nextReset,
            updatedAt: new Date(),
          })
          .where(eq(challengeProgress.challengeId, challenge.id));
        
        resetCount++;
      }
      
      console.log(`✅ Reset ${resetCount} weekly challenges. Next reset: ${nextReset.toISOString()}`);
    } catch (error) {
      console.error('❌ Error resetting weekly challenges:', error);
      throw error;
    }
  }
  
  /**
   * Check if two dates are on different days
   */
  private isDifferentDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() !== date2.getFullYear() ||
      date1.getMonth() !== date2.getMonth() ||
      date1.getDate() !== date2.getDate()
    );
  }
  
  /**
   * Check if two dates are in different weeks
   */
  private isDifferentWeek(date1: Date, date2: Date): boolean {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.abs(date2.getTime() - date1.getTime()) >= oneWeek;
  }
  
  /**
   * Manually trigger a reset check (useful for testing)
   */
  async triggerDailyReset(): Promise<void> {
    await this.resetDailyChallenges();
  }
  
  /**
   * Manually trigger a weekly reset check (useful for testing)
   */
  async triggerWeeklyReset(): Promise<void> {
    await this.resetWeeklyChallenges();
  }
}

// Export singleton instance
export const challengeScheduler = new ChallengeScheduler();
