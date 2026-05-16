import { db } from "../db";
import { gammaThemes, type GammaTheme, type InsertGammaTheme } from "@shared/schema";
import { GammaService } from "./gammaService";
import { eq, sql, notInArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { getPublicUploadDir } from "../utils/uploadPaths";

// Mutex to prevent concurrent sync runs
let isSyncing = false;
const THEME_THUMB_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

async function resolveThemeThumbnailFromLocalUploads(themeId: string): Promise<string | null> {
  const themeDir = path.join(getPublicUploadDir(), "gamma", "themes", themeId);
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(themeDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && THEME_THUMB_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);

  if (candidates.length === 0) {
    return null;
  }

  const withMtime = await Promise.all(
    candidates.map(async (fileName) => {
      const fullPath = path.join(themeDir, fileName);
      const stat = await fs.promises.stat(fullPath);
      return { fileName, mtimeMs: stat.mtimeMs };
    })
  );

  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const selected = withMtime[0]?.fileName;
  return selected ? `/api/public-objects/gamma/themes/${themeId}/${selected}` : null;
}

async function hydrateThemeThumbnail(theme: GammaTheme): Promise<GammaTheme> {
  if (theme.thumbnailUrl) {
    return theme;
  }

  const inferredThumbnailUrl = await resolveThemeThumbnailFromLocalUploads(theme.id);
  if (!inferredThumbnailUrl) {
    return theme;
  }

  return {
    ...theme,
    thumbnailUrl: inferredThumbnailUrl,
  };
}

async function buildLocalThemeFallbacks(): Promise<GammaTheme[]> {
  const themesRoot = path.join(getPublicUploadDir(), "gamma", "themes");
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(themesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const themeIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const fallbacks = await Promise.all(
    themeIds.map(async (themeId) => {
      const thumbnailUrl = await resolveThemeThumbnailFromLocalUploads(themeId);
      const displayName = themeId
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        id: themeId,
        name: displayName,
        description: "Recovered from local upload assets",
        thumbnailUrl,
        categories: null,
        isActive: true,
        source: "manual",
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as GammaTheme;
    })
  );

  return fallbacks.sort((a, b) => a.name.localeCompare(b.name));
}

export class GammaThemeSyncService {
  /**
   * Sync themes from Gamma API to database with transaction protection
   * Runs every 24 hours via scheduler
   */
  static async syncThemes(): Promise<{ success: boolean; themesCount?: number; error?: string }> {
    // Prevent concurrent syncs
    if (isSyncing) {
      console.warn("[GammaThemeSync] Sync already in progress, skipping...");
      return { success: false, error: "Sync already in progress" };
    }
    
    isSyncing = true;
    console.log("[GammaThemeSync] Starting theme sync from Gamma API...");
    
    try {
      // Fetch themes from Gamma API
      const gammaService = await GammaService.getInstance();
      const themes = await gammaService.getAvailableThemes();
      
      console.log(`[GammaThemeSync] Fetched ${themes?.length || 0} themes from Gamma API`);
      
      // Perform sync in a transaction
      await db.transaction(async (tx) => {
        // Serialize theme sync across clustered instances sharing the same database.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('gammaThemeSync_v1'))`);
        const now = new Date();
        const fetchedThemeIds = themes && themes.length > 0 ? themes.map(t => t.id) : [];
        
        // Upsert each theme if we have any
        if (themes && themes.length > 0) {
          for (const theme of themes) {
            const existing = await tx
              .select()
              .from(gammaThemes)
              .where(eq(gammaThemes.id, theme.id))
              .limit(1);
            
            if (existing.length > 0) {
              // Update existing theme, preserving manually uploaded thumbnails
              // Note: Gamma API doesn't provide thumbnailUrl, so we only update it if current value is null
              const updateData: any = {
                name: theme.name,
                description: theme.description,
                categories: theme.categories || null,
                isActive: true,
                lastSyncedAt: now,
                lastSyncError: null,
                updatedAt: now,
              };
              
              // Only update thumbnailUrl if existing record has none (preserve manual uploads)
              if (existing[0].thumbnailUrl === null && theme.thumbnailUrl) {
                updateData.thumbnailUrl = theme.thumbnailUrl;
              }
              
              await tx
                .update(gammaThemes)
                .set(updateData)
                .where(eq(gammaThemes.id, theme.id));
            } else {
              // Insert new theme
              await tx.insert(gammaThemes).values({
                id: theme.id,
                name: theme.name,
                description: theme.description,
                thumbnailUrl: theme.thumbnailUrl,
                categories: theme.categories || null,
                isActive: true,
                lastSyncedAt: now,
                lastSyncError: null,
              });
            }
          }
        }
        
        // Mark themes not in API response as inactive only when we have a non-empty,
        // authoritative result set to avoid mass deactivation on transient upstream failures.
        if (fetchedThemeIds.length > 0) {
          await tx
            .update(gammaThemes)
            .set({
              isActive: false,
              updatedAt: now,
            })
            .where(notInArray(gammaThemes.id, fetchedThemeIds));
        }
      });
      
      console.log(`[GammaThemeSync] Successfully synced ${themes?.length || 0} themes`);
      
      return {
        success: true,
        themesCount: themes?.length || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[GammaThemeSync] Theme sync failed:", errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // Always reset mutex
      isSyncing = false;
    }
  }
  
  /**
   * Get all active themes from database with filtering and pagination
   */
  static async getActiveThemes(
    search?: string,
    category?: string,
    limit?: number,
    offset?: number
  ): Promise<{ themes: GammaTheme[]; total: number }> {
    try {
      let query = db
        .select()
        .from(gammaThemes)
        .where(eq(gammaThemes.isActive, true));
      
      const allThemes = await query;
      let filteredThemes = allThemes;
      
      // Apply category filter if provided
      if (category && category.trim() && category.toLowerCase() !== 'all') {
        const categoryLower = category.toLowerCase();
        filteredThemes = filteredThemes.filter((theme) => {
          if (!theme.categories) return false;
          const categories = Array.isArray(theme.categories) 
            ? theme.categories 
            : [];
          return categories.some((cat: string) => 
            cat.toLowerCase() === categoryLower
          );
        });
      }
      
      // Apply search filter if provided
      if (search && search.trim()) {
        const searchLower = search.toLowerCase();
        filteredThemes = filteredThemes.filter((theme) => {
          const nameMatch = theme.name.toLowerCase().includes(searchLower);
          const descMatch = theme.description && theme.description.toLowerCase().includes(searchLower);
          
          // Search in categories array
          let categoryMatch = false;
          if (theme.categories) {
            const categories = Array.isArray(theme.categories) 
              ? theme.categories 
              : [];
            categoryMatch = categories.some((cat: string) => 
              cat.toLowerCase().includes(searchLower)
            );
          }
          
          return nameMatch || descMatch || categoryMatch;
        });
      }
      
      const total = filteredThemes.length;
      
      // Apply pagination if provided
      if (limit !== undefined && offset !== undefined) {
        filteredThemes = filteredThemes.slice(offset, offset + limit);
      }
      
      if (filteredThemes.length === 0) {
        const localFallbacks = await buildLocalThemeFallbacks();
        if (localFallbacks.length > 0) {
          return { themes: localFallbacks, total: localFallbacks.length };
        }
      }

      const hydratedThemes = await Promise.all(filteredThemes.map((theme) => hydrateThemeThumbnail(theme)));
      return { themes: hydratedThemes, total };
    } catch (error) {
      console.error("[GammaThemeSync] Error fetching active themes:", error);
      return { themes: [], total: 0 };
    }
  }
  
  /**
   * Get theme by ID
   */
  static async getThemeById(themeId: string): Promise<GammaTheme | null> {
    try {
      const result = await db
        .select()
        .from(gammaThemes)
        .where(eq(gammaThemes.id, themeId))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error(`[GammaThemeSync] Error fetching theme ${themeId}:`, error);
      return null;
    }
  }
}
