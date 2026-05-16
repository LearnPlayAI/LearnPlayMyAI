import { storage } from './storage';

/**
 * Season Pass Auto-Transition Scheduler
 * 
 * This service automatically transitions season passes between states based on dates:
 * - scheduled → active when current time >= startDate
 * - active → expired when current time >= endDate
 * 
 * Runs every hour to check for transitions
 */

class SeasonPassScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
  
  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.log('⏰ Season pass scheduler is already running');
      return;
    }
    
    console.log('⏰ Starting season pass scheduler...');
    
    // Run immediately on startup
    this.checkTransitions().catch(err => {
      console.error('❌ Error in initial season pass check:', err);
    });
    
    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkTransitions().catch(err => {
        console.error('❌ Error in season pass scheduler:', err);
      });
    }, this.CHECK_INTERVAL);
    
    console.log(`✅ Season pass scheduler started - checking every ${this.CHECK_INTERVAL / 60000} minutes`);
  }
  
  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏰ Season pass scheduler stopped');
    }
  }
  
  /**
   * Check and perform season pass state transitions
   */
  private async checkTransitions(): Promise<void> {
    try {
      const now = new Date();
      console.log(`⏰ Checking season pass transitions at ${now.toISOString()}`);
      
      // Get all season passes (no filter - check all)
      const allSeasonPasses = await storage.getSeasonPasses();
      
      let activatedCount = 0;
      let expiredCount = 0;
      
      for (const seasonPass of allSeasonPasses) {
        // Check for scheduled → active transition
        if (
          seasonPass.status === 'scheduled' &&
          seasonPass.startDate &&
          new Date(seasonPass.startDate) <= now
        ) {
          // Check if another season pass is already active in this scope
          const existingActive = await storage.getActiveSeasonPass(
            seasonPass.scope === 'global' ? 'global' : seasonPass.organizationId || undefined
          );
          
          if (existingActive && existingActive.id !== seasonPass.id) {
            console.log(
              `⚠️ Cannot auto-activate season pass "${seasonPass.seasonName}" (${seasonPass.id}) - ` +
              `another season pass "${existingActive.seasonName}" (${existingActive.id}) is already active`
            );
            continue;
          }
          
          // Activate the season pass
          await storage.activateSeasonPass(seasonPass.id);
          activatedCount++;
          console.log(
            `✅ Auto-activated season pass: "${seasonPass.seasonName}" (${seasonPass.id}) ` +
            `[${seasonPass.scope}${seasonPass.organizationId ? `:${seasonPass.organizationId}` : ''}]`
          );
        }
        
        // Check for active → expired transition
        if (
          seasonPass.status === 'active' &&
          seasonPass.endDate &&
          new Date(seasonPass.endDate) <= now
        ) {
          // Expire the season pass
          await storage.expireSeasonPass(seasonPass.id);
          expiredCount++;
          console.log(
            `✅ Auto-expired season pass: "${seasonPass.seasonName}" (${seasonPass.id}) ` +
            `[${seasonPass.scope}${seasonPass.organizationId ? `:${seasonPass.organizationId}` : ''}]`
          );
        }
      }
      
      if (activatedCount === 0 && expiredCount === 0) {
        console.log('⏰ No season pass transitions needed at this time');
      } else {
        console.log(`⏰ Season pass transitions complete: ${activatedCount} activated, ${expiredCount} expired`);
      }
    } catch (error) {
      console.error('❌ Error checking season pass transitions:', error);
      throw error;
    }
  }
  
  /**
   * Manually trigger a transition check (useful for testing)
   */
  async triggerCheck(): Promise<void> {
    await this.checkTransitions();
  }
}

// Export singleton instance
export const seasonPassScheduler = new SeasonPassScheduler();
