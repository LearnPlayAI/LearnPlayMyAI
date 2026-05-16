import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('reports page contracts', () => {
  const readSource = (relativePath: string) =>
    fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('keeps fetched teams visible when the teams endpoint is already scoped to a unit', () => {
    const source = readSource('client/src/pages/Reports.tsx');

    expect(source).toContain("!team.subUnitId || team.subUnitId === selectedUnit");
  });

  it('maps quiz breakdown drilldown to quiz rows, not learner rows', () => {
    const source = readSource('client/src/pages/Reports.tsx');

    expect(source).toContain("return quizBreakdown?.quizzes || []");
    expect(source).toContain("{ key: 'quizName', header: 'Quiz' }");
  });

  it('carries active report filters into drilldown queries and export-all output', () => {
    const source = readSource('client/src/pages/Reports.tsx');

    expect(source).toContain("subUnitId: selectedUnit !== 'all' ? selectedUnit : undefined");
    expect(source).toContain("queryKey: ['/api/reports/learner-analytics', orgId, 'course-learners', drilldownModal.param, reportFilters]");
    expect(source).toContain("queryKey: ['/api/reports/learner-analytics', orgId, 'quiz-breakdown', reportFilters]");
    expect(source).toContain("const handleExportAll = async () =>");
    expect(source).not.toContain("description: 'Exported report data from all tabs'");
  });

  it('keeps department and sub-unit report filters distinct across client and server', () => {
    const pageSource = readSource('client/src/pages/Reports.tsx');
    const routeSource = readSource('server/routes/reportRoutes.ts');

    expect(pageSource).toContain('subUnitId: unitFilter');
    expect(routeSource).toContain('filters.subUnitId = query.subUnitId');
    expect(routeSource).toContain('AND uoa."subUnitId" = ${filters.subUnitId}');
  });

  it('keeps deadline date filters aligned with the assignment date selected by the API', () => {
    const source = readSource('server/routes/reportRoutes.ts');

    expect(source).toContain('COALESCE(ca."assignedAt", ca."createdAt") as assigned_on');
    expect(source).toContain('AND ea.assigned_on >=');
    expect(source).toContain('AND ea.assigned_on <=');
  });
});
