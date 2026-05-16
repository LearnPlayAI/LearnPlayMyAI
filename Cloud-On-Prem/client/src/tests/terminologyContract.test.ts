import { describe, expect, it } from '@jest/globals';
import { getTerminology } from '../utils/terminology';

describe('organization terminology contract', () => {
  it('keeps business labels business-facing without changing stored role names', () => {
    expect(getTerminology('business')).toMatchObject({
      learner: 'Learner',
      learnerPlural: 'Learners',
      learnerRole: 'learner',
      educator: 'Instructor',
      educatorPlural: 'Instructors',
      educatorRole: 'team_lead',
      unit: 'Department',
      unitPlural: 'Departments',
      subUnit: 'Unit',
      subUnitPlural: 'Units',
      team: 'Team',
      teamPlural: 'Teams',
    });
  });

  it('keeps education labels school-facing without changing stored role names', () => {
    expect(getTerminology('education')).toMatchObject({
      learner: 'Student',
      learnerPlural: 'Students',
      learnerRole: 'student',
      educator: 'Teacher',
      educatorPlural: 'Teachers',
      educatorRole: 'teacher',
      unit: 'Grade',
      unitPlural: 'Grades',
      subUnit: 'Class',
      subUnitPlural: 'Classes',
      subject: 'Subject',
      subjectPlural: 'Subjects',
    });
  });
});
