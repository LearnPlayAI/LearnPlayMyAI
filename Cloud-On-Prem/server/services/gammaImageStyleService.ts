import { db } from "../db";
import { gammaImageStyles, type GammaImageStyle } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { getPublicUploadDir } from "../utils/uploadPaths";

const STYLE_EXTENSIONS = [".jpeg", ".jpg", ".png", ".webp", ".gif"];

async function resolveStyleThumbnail(styleKey: string): Promise<string | null> {
  const stylesDir = path.join(getPublicUploadDir(), "gamma", "image-styles");

  for (const ext of STYLE_EXTENSIONS) {
    const fileName = `${styleKey}${ext}`;
    const fullPath = path.join(stylesDir, fileName);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return `/api/public-objects/gamma/image-styles/${fileName}`;
    } catch {
      // continue
    }
  }

  return null;
}

export class GammaImageStyleService {
  /**
   * Get all active image styles from database
   */
  static async getActiveStyles(search?: string): Promise<GammaImageStyle[]> {
    try {
      const styles = await db
        .select()
        .from(gammaImageStyles)
        .where(eq(gammaImageStyles.isActive, true))
        .orderBy(desc(gammaImageStyles.weight));
      
      // Apply search filter if provided
      if (search && search.trim()) {
        const searchLower = search.toLowerCase();
        return styles.filter(
          (style) =>
            style.displayName.toLowerCase().includes(searchLower) ||
            style.styleKey.toLowerCase().includes(searchLower) ||
            (style.description && style.description.toLowerCase().includes(searchLower))
        );
      }
      
      const hydrated = await Promise.all(
        styles.map(async (style) => {
          if (style.thumbnailUrl) {
            return style;
          }
          const inferred = await resolveStyleThumbnail(style.styleKey);
          return inferred ? { ...style, thumbnailUrl: inferred } : style;
        })
      );

      return hydrated;
    } catch (error) {
      console.error("[GammaImageStyleService] Error fetching active styles:", error);
      return [];
    }
  }
  
  /**
   * Get style by styleKey
   */
  static async getStyleByKey(styleKey: string): Promise<GammaImageStyle | null> {
    try {
      const result = await db
        .select()
        .from(gammaImageStyles)
        .where(eq(gammaImageStyles.styleKey, styleKey))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error(`[GammaImageStyleService] Error fetching style ${styleKey}:`, error);
      return null;
    }
  }
}
