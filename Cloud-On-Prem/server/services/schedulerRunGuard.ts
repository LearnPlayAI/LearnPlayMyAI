import { db } from '../db';
import { systemSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function shouldRunJob(jobKey: string, intervalMs: number): Promise<boolean> {
  const settingKey = `scheduler_last_run_${jobKey}`;

  try {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, settingKey))
      .limit(1);

    if (!setting) {
      return true;
    }

    const lastRunTime = parseInt(setting.settingValue, 10);
    if (isNaN(lastRunTime)) {
      return true;
    }

    const elapsed = Date.now() - lastRunTime;
    return elapsed >= intervalMs;
  } catch (error) {
    console.error(`[SchedulerRunGuard] Error checking job ${jobKey}:`, error);
    return true;
  }
}

export async function markJobRun(jobKey: string): Promise<void> {
  const settingKey = `scheduler_last_run_${jobKey}`;
  const now = Date.now().toString();

  try {
    await db
      .insert(systemSettings)
      .values({
        settingKey,
        settingValue: now,
        dataType: 'number',
        description: `Last run timestamp for scheduler job: ${jobKey}`,
      })
      .onConflictDoUpdate({
        target: systemSettings.settingKey,
        set: {
          settingValue: now,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error(`[SchedulerRunGuard] Error marking job ${jobKey}:`, error);
  }
}
