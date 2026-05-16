import { db } from '../db';
import { 
  quizCollections, quizCards, quizCardExplanations,
  quizCollectionVersions, quizCardVersions,
  type SelectQuizCollectionVersion 
} from '@shared/schema';
import { eq, and, desc, sql, asc } from 'drizzle-orm';

export interface QuizVersionDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface QuizVersionHistoryEntry {
  id: string;
  collectionId: string;
  versionNumber: number;
  name: string | null;
  description: string | null;
  totalCards: number | null;
  difficulty: string | null;
  passPercentage: number | null;
  changeDescription: string | null;
  diffSummary: any;
  editedBy: string | null;
  createdAt: Date | null;
}

export class QuizVersioningService {
  /**
   * Create a new version snapshot for a quiz collection.
   * Uses FOR UPDATE row locking to prevent concurrent version creation.
   * Follows append-only pattern — versions are never modified or deleted.
   */
  static async createVersion(
    collectionId: string,
    options: {
      changeDescription?: string;
      editedBy?: string;
      organizationId?: string;
    } = {}
  ): Promise<SelectQuizCollectionVersion> {
    return await db.transaction(async (tx) => {
      // Lock the quiz collection row to prevent concurrent version creation
      const [collection] = await tx
        .select()
        .from(quizCollections)
        .where(eq(quizCollections.id, collectionId))
        .for('update');

      if (!collection) {
        throw new Error(`Quiz collection ${collectionId} not found`);
      }

      // Get all cards for snapshot
      const cards = await tx
        .select()
        .from(quizCards)
        .where(eq(quizCards.collectionId, collectionId))
        .orderBy(asc(quizCards.displayOrder));

      // Get explanations for cards
      const cardIds = cards.map(c => c.id);
      let explanations: any[] = [];
      if (cardIds.length > 0) {
        explanations = await tx
          .select()
          .from(quizCardExplanations)
          .where(sql`${quizCardExplanations.cardId} = ANY(${cardIds})`);
      }

      // Get next version number
      const [maxVersion] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${quizCollectionVersions.versionNumber}), 0)` })
        .from(quizCollectionVersions)
        .where(eq(quizCollectionVersions.collectionId, collectionId));

      const nextVersion = (maxVersion?.max || 0) + 1;

      // Build full snapshot
      const collectionSnapshot = {
        collection: {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          totalCards: collection.totalCards,
          difficulty: collection.difficulty,
          passPercentage: collection.passPercentage,
          isPublic: collection.isPublic,
          languageCode: collection.languageCode,
        },
        cards: cards.map(c => ({
          id: c.id,
          questionType: c.questionType,
          question: c.question,
          answer1: c.answer1,
          answer2: c.answer2,
          answer3: c.answer3,
          answer4: c.answer4,
          answer5: c.answer5,
          answer6: c.answer6,
          correctAnswerIndex: c.correctAnswerIndex,
          matchPairs: c.matchPairs,
          correctAnswer: c.correctAnswer,
          displayOrder: c.displayOrder,
        })),
        explanations: explanations.map(e => ({
          cardId: e.cardId,
          explanation: e.explanation,
        })),
      };

      // Compute diff from previous version
      let diffSummary: QuizVersionDiff[] | null = null;
      if (nextVersion > 1) {
        const [prevVersion] = await tx
          .select()
          .from(quizCollectionVersions)
          .where(and(
            eq(quizCollectionVersions.collectionId, collectionId),
            eq(quizCollectionVersions.versionNumber, nextVersion - 1)
          ))
          .limit(1);

        if (prevVersion) {
          diffSummary = QuizVersioningService.computeDiff(prevVersion, {
            name: collection.name,
            description: collection.description,
            totalCards: collection.totalCards,
            difficulty: collection.difficulty,
            passPercentage: collection.passPercentage,
          });
        }
      }

      // Insert version record
      const [version] = await tx
        .insert(quizCollectionVersions)
        .values({
          collectionId,
          organizationId: options.organizationId || collection.organizationId,
          versionNumber: nextVersion,
          name: collection.name,
          description: collection.description,
          totalCards: collection.totalCards,
          difficulty: collection.difficulty,
          passPercentage: collection.passPercentage,
          collectionSnapshot,
          changeDescription: options.changeDescription || `Version ${nextVersion}`,
          diffSummary: diffSummary ? diffSummary : undefined,
          editedBy: options.editedBy,
        })
        .returning();

      // Also create card-level versions
      for (const card of cards) {
        // Get next card version number
        const [maxCardVersion] = await tx
          .select({ max: sql<number>`COALESCE(MAX(${quizCardVersions.versionNumber}), 0)` })
          .from(quizCardVersions)
          .where(eq(quizCardVersions.cardId, card.id));

        const nextCardVersion = (maxCardVersion?.max || 0) + 1;

        await tx.insert(quizCardVersions).values({
          cardId: card.id,
          collectionId,
          versionNumber: nextCardVersion,
          questionType: card.questionType,
          question: card.question,
          answer1: card.answer1,
          answer2: card.answer2,
          answer3: card.answer3,
          answer4: card.answer4,
          answer5: card.answer5,
          answer6: card.answer6,
          correctAnswerIndex: card.correctAnswerIndex,
          matchPairs: card.matchPairs,
          correctAnswer: card.correctAnswer,
          cardSnapshot: {
            id: card.id,
            questionType: card.questionType,
            question: card.question,
            answer1: card.answer1,
            answer2: card.answer2,
            answer3: card.answer3,
            answer4: card.answer4,
            answer5: card.answer5,
            answer6: card.answer6,
            correctAnswerIndex: card.correctAnswerIndex,
            matchPairs: card.matchPairs,
            correctAnswer: card.correctAnswer,
            displayOrder: card.displayOrder,
          },
          changeDescription: options.changeDescription,
          editedBy: options.editedBy,
        });
      }

      console.log(`[QuizVersioning] Created version ${nextVersion} for collection ${collectionId} with ${cards.length} cards`);
      return version;
    });
  }

  /**
   * Restore a quiz collection to a previous version.
   * Creates TWO new versions: pre-restore snapshot + post-restore snapshot.
   */
  static async restoreVersion(
    collectionId: string,
    targetVersionNumber: number,
    options: { editedBy?: string; organizationId?: string } = {}
  ): Promise<SelectQuizCollectionVersion> {
    return await db.transaction(async (tx) => {
      // Lock the collection row
      const [collection] = await tx
        .select()
        .from(quizCollections)
        .where(eq(quizCollections.id, collectionId))
        .for('update');

      if (!collection) {
        throw new Error(`Quiz collection ${collectionId} not found`);
      }

      // Find the target version
      const [targetVersion] = await tx
        .select()
        .from(quizCollectionVersions)
        .where(and(
          eq(quizCollectionVersions.collectionId, collectionId),
          eq(quizCollectionVersions.versionNumber, targetVersionNumber)
        ))
        .limit(1);

      if (!targetVersion) {
        throw new Error(`Version ${targetVersionNumber} not found for collection ${collectionId}`);
      }

      const snapshot = targetVersion.collectionSnapshot as any;
      if (!snapshot?.collection) {
        throw new Error(`Invalid snapshot data for version ${targetVersionNumber}`);
      }

      // Step 1: Create pre-restore version (capture current state)
      // Done outside this transaction's scope — we call createVersion separately
      // For simplicity, we'll do it inline here

      // Get current cards for pre-restore snapshot
      const currentCards = await tx
        .select()
        .from(quizCards)
        .where(eq(quizCards.collectionId, collectionId));

      const [maxVersion] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${quizCollectionVersions.versionNumber}), 0)` })
        .from(quizCollectionVersions)
        .where(eq(quizCollectionVersions.collectionId, collectionId));

      const preRestoreVersion = (maxVersion?.max || 0) + 1;

      // Insert pre-restore snapshot
      await tx.insert(quizCollectionVersions).values({
        collectionId,
        organizationId: options.organizationId || collection.organizationId,
        versionNumber: preRestoreVersion,
        name: collection.name,
        description: collection.description,
        totalCards: collection.totalCards,
        difficulty: collection.difficulty,
        passPercentage: collection.passPercentage,
        collectionSnapshot: {
          collection: {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            totalCards: collection.totalCards,
            difficulty: collection.difficulty,
            passPercentage: collection.passPercentage,
          },
          cards: currentCards,
          explanations: [],
        },
        changeDescription: `Pre-restore snapshot (before restoring to v${targetVersionNumber})`,
        editedBy: options.editedBy,
      });

      // Step 2: Restore the collection metadata
      await tx
        .update(quizCollections)
        .set({
          name: snapshot.collection.name,
          description: snapshot.collection.description,
          totalCards: snapshot.collection.totalCards,
          difficulty: snapshot.collection.difficulty,
          passPercentage: snapshot.collection.passPercentage,
          updatedAt: new Date(),
        })
        .where(eq(quizCollections.id, collectionId));

      // Step 3: Restore cards — delete current and insert from snapshot
      await tx
        .delete(quizCards)
        .where(eq(quizCards.collectionId, collectionId));

      if (snapshot.cards && snapshot.cards.length > 0) {
        for (const card of snapshot.cards) {
          await tx.insert(quizCards).values({
            id: card.id,
            collectionId,
            questionType: card.questionType || 'multiple-choice',
            question: card.question,
            answer1: card.answer1,
            answer2: card.answer2,
            answer3: card.answer3,
            answer4: card.answer4,
            answer5: card.answer5,
            answer6: card.answer6,
            correctAnswerIndex: card.correctAnswerIndex,
            matchPairs: card.matchPairs,
            correctAnswer: card.correctAnswer,
            displayOrder: card.displayOrder || 0,
          });
        }
      }

      // Step 4: Create post-restore version
      const postRestoreVersion = preRestoreVersion + 1;

      const [restoredVersion] = await tx
        .insert(quizCollectionVersions)
        .values({
          collectionId,
          organizationId: options.organizationId || collection.organizationId,
          versionNumber: postRestoreVersion,
          name: snapshot.collection.name,
          description: snapshot.collection.description,
          totalCards: snapshot.collection.totalCards,
          difficulty: snapshot.collection.difficulty,
          passPercentage: snapshot.collection.passPercentage,
          collectionSnapshot: snapshot,
          changeDescription: `Restored to version ${targetVersionNumber}`,
          editedBy: options.editedBy,
        })
        .returning();

      console.log(`[QuizVersioning] Restored collection ${collectionId} to v${targetVersionNumber} (now v${postRestoreVersion})`);
      return restoredVersion;
    });
  }

  /**
   * Get version history for a quiz collection
   */
  static async getVersionHistory(collectionId: string): Promise<QuizVersionHistoryEntry[]> {
    const versions = await db
      .select({
        id: quizCollectionVersions.id,
        collectionId: quizCollectionVersions.collectionId,
        versionNumber: quizCollectionVersions.versionNumber,
        name: quizCollectionVersions.name,
        description: quizCollectionVersions.description,
        totalCards: quizCollectionVersions.totalCards,
        difficulty: quizCollectionVersions.difficulty,
        passPercentage: quizCollectionVersions.passPercentage,
        changeDescription: quizCollectionVersions.changeDescription,
        diffSummary: quizCollectionVersions.diffSummary,
        editedBy: quizCollectionVersions.editedBy,
        createdAt: quizCollectionVersions.createdAt,
      })
      .from(quizCollectionVersions)
      .where(eq(quizCollectionVersions.collectionId, collectionId))
      .orderBy(desc(quizCollectionVersions.versionNumber));

    return versions;
  }

  /**
   * Get a specific version's full snapshot
   */
  static async getVersionSnapshot(collectionId: string, versionNumber: number): Promise<any | null> {
    const [version] = await db
      .select()
      .from(quizCollectionVersions)
      .where(and(
        eq(quizCollectionVersions.collectionId, collectionId),
        eq(quizCollectionVersions.versionNumber, versionNumber)
      ))
      .limit(1);

    return version?.collectionSnapshot || null;
  }

  /**
   * Compute diff between a previous version and current values
   */
  static computeDiff(
    previousVersion: SelectQuizCollectionVersion,
    currentValues: {
      name: string;
      description: string | null;
      totalCards: number | null;
      difficulty: string | null;
      passPercentage: number | null;
    }
  ): QuizVersionDiff[] {
    const diffs: QuizVersionDiff[] = [];
    const fields: Array<{ key: keyof typeof currentValues; label: string }> = [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'totalCards', label: 'Total Cards' },
      { key: 'difficulty', label: 'Difficulty' },
      { key: 'passPercentage', label: 'Pass Percentage' },
    ];

    for (const { key, label } of fields) {
      const oldVal = (previousVersion as any)[key];
      const newVal = currentValues[key];
      if (oldVal !== newVal) {
        diffs.push({ field: label, oldValue: oldVal, newValue: newVal });
      }
    }

    return diffs;
  }

  /**
   * Delete all versions for a quiz collection (used on collection deletion)
   */
  static async deleteVersionsForCollection(collectionId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(quizCardVersions).where(eq(quizCardVersions.collectionId, collectionId));
      await tx.delete(quizCollectionVersions).where(eq(quizCollectionVersions.collectionId, collectionId));
    });
    console.log(`[QuizVersioning] Deleted all versions for collection ${collectionId}`);
  }
}
