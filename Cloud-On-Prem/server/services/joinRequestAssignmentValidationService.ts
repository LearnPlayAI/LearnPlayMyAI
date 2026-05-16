import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { unitSubjects } from '@shared/schema';

export async function validateUnitSubjectAssignments({
  unitId,
  subjectIds,
}: {
  unitId?: string | null;
  subjectIds?: string[] | null;
}): Promise<void> {
  const uniqueSubjectIds = Array.from(new Set(subjectIds || []));
  if (!unitId || uniqueSubjectIds.length === 0) {
    return;
  }

  const validSubjects = await db
    .select({ subjectId: unitSubjects.subjectId })
    .from(unitSubjects)
    .where(
      and(
        eq(unitSubjects.unitId, unitId),
        inArray(unitSubjects.subjectId, uniqueSubjectIds),
      ),
    );

  if (validSubjects.length !== uniqueSubjectIds.length) {
    const validSubjectIds = new Set(validSubjects.map((subject) => subject.subjectId));
    const invalidSubjectIds = uniqueSubjectIds.filter((id) => !validSubjectIds.has(id));
    throw new Error(
      `Invalid subject assignment: subjects [${invalidSubjectIds.join(', ')}] are not linked to unit ${unitId}. Please ensure each subject is configured for this grade before approving the join request.`,
    );
  }
}
