import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

describe('Course availability wizard contract', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/CourseEdit.tsx'),
    'utf8'
  );

  it('exposes a guided availability wizard from the course editor', () => {
    expect(source).toContain('CourseAvailabilityWizard');
    expect(source).toContain('Set Availability & Assign');
    expect(source).toContain('Set Availability & Publish');
    expect(source).toContain('data-testid="button-open-availability-wizard"');
    expect(source).toContain('data-testid="availability-category"');
    expect(source).toContain('data-testid="availability-create-category"');
    expect(source).toContain('data-testid="availability-audience-target-org"');
    expect(source).toContain('CreateCategoryInlineCard');
  });

  it('loads partner organizations for the course owner configuration', () => {
    expect(source).toContain("queryKey: ['/api/interorg/target-orgs', courseId]");
    expect(source).toContain('fetch(`/api/interorg/target-orgs?courseId=${courseId}`');
  });

  it('keeps availability changes on the existing course and assignment APIs', () => {
    expect(source).toContain("apiRequest(`/api/courses/${courseId}`");
    expect(source).toContain("apiRequest('/api/course-assignments'");
    expect(source).toContain("apiRequest(`/api/courses/${courseId}/publish`");
    expect(source).toContain('targetOrgHierarchy');
    expect(source).toContain('/api/interorg/target-orgs/${selectedTargetOrgId}/hierarchy');
  });

  it('does not block availability save on stale publish validation', () => {
    expect(source).toContain('const publishReadinessMessage = availabilityPublishReadinessErrors[0] || validationErrors[0];');
    expect(source).not.toContain('disabled={availabilityWizardMutation.isPending || (publishAfterAvailability && !isPublished && !canPublish)}');
  });

  it('publishes partner courses before creating the cross-org assignment', () => {
    const sourceOrder = source.indexOf("if (publishAfterAvailability && availabilityAudience === 'cross_org')");
    const assignmentOrder = source.indexOf("await apiRequest('/api/course-assignments'");

    expect(sourceOrder).toBeGreaterThan(-1);
    expect(assignmentOrder).toBeGreaterThan(-1);
    expect(sourceOrder).toBeLessThan(assignmentOrder);
  });

  it('republishes availability saves even when the course was already active', () => {
    expect(source).toContain("if (publishAfterAvailability && availabilityAudience === 'cross_org')");
    expect(source).toContain("if (publishAfterAvailability && availabilityAudience !== 'cross_org')");
    expect(source).not.toContain("publishAfterAvailability && !isPublished");
    expect(source).not.toContain('disabled={isPublished}');
    expect(source).toContain('Publish latest changes');
    expect(source).toContain('Automatic');
    expect(source).not.toContain('data-testid="availability-publish"');
  });

  it('replaces the old inline assignment settings with a compact summary', () => {
    expect(source).toContain('Availability Summary');
    expect(source).not.toContain('Course Assignment Settings');
    expect(source).not.toContain('Quick Assign Course');
  });
});
