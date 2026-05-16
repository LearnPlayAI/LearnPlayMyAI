export type OrganizationType = 'education' | 'business' | 'elearning';

export interface TerminologyMap {
  learner: string;
  learnerPlural: string;
  learnerRole: string;
  unit: string;
  unitPlural: string;
  subUnit: string;
  subUnitPlural: string;
  team: string;        // Level 3: Section (education), Team (business)
  teamPlural: string;
  educator: string;
  educatorPlural: string;
  educatorRole: string;
  subject: string;
  subjectPlural: string;
}

export function getTerminology(orgType: OrganizationType = 'education'): TerminologyMap {
  switch (orgType) {
    case 'education':
      return {
        learner: 'Student',
        learnerPlural: 'Students',
        learnerRole: 'student',
        unit: 'Grade',           // Level 1: Department
        unitPlural: 'Grades',
        subUnit: 'Class',        // Level 2: Unit
        subUnitPlural: 'Classes',
        team: 'Section',         // Level 3: Team
        teamPlural: 'Sections',
        educator: 'Teacher',
        educatorPlural: 'Teachers',
        educatorRole: 'teacher',
        subject: 'Subject',
        subjectPlural: 'Subjects',
      };
    case 'business':
      return {
        learner: 'Learner',
        learnerPlural: 'Learners',
        learnerRole: 'learner',
        unit: 'Department',      // Level 1: Department
        unitPlural: 'Departments',
        subUnit: 'Unit',         // Level 2: Unit
        subUnitPlural: 'Units',
        team: 'Team',            // Level 3: Team
        teamPlural: 'Teams',
        educator: 'Instructor',
        educatorPlural: 'Instructors',
        educatorRole: 'team_lead',
        subject: 'Topic',
        subjectPlural: 'Topics',
      };
    case 'elearning':
      return {
        learner: 'Student',
        learnerPlural: 'Students',
        learnerRole: 'student',
        unit: 'Course',          // Level 1
        unitPlural: 'Courses',
        subUnit: 'Module',       // Level 2
        subUnitPlural: 'Modules',
        team: 'Cohort',          // Level 3
        teamPlural: 'Cohorts',
        educator: 'Instructor',
        educatorPlural: 'Instructors',
        educatorRole: 'instructor',
        subject: 'Category',
        subjectPlural: 'Categories',
      };
  }
}

export function formatTermWithArticle(term: string, indefinite: boolean = false): string {
  if (indefinite) {
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    const firstLetter = term.toLowerCase()[0];
    const article = vowels.includes(firstLetter) ? 'an' : 'a';
    return `${article} ${term.toLowerCase()}`;
  }
  return `the ${term.toLowerCase()}`;
}

export function getLowercaseTerminology(orgType: OrganizationType = 'education'): TerminologyMap {
  const terms = getTerminology(orgType);
  return {
    learner: terms.learner.toLowerCase(),
    learnerPlural: terms.learnerPlural.toLowerCase(),
    learnerRole: terms.learnerRole.toLowerCase(),
    unit: terms.unit.toLowerCase(),
    unitPlural: terms.unitPlural.toLowerCase(),
    subUnit: terms.subUnit.toLowerCase(),
    subUnitPlural: terms.subUnitPlural.toLowerCase(),
    team: terms.team.toLowerCase(),
    teamPlural: terms.teamPlural.toLowerCase(),
    educator: terms.educator.toLowerCase(),
    educatorPlural: terms.educatorPlural.toLowerCase(),
    educatorRole: terms.educatorRole.toLowerCase(),
    subject: terms.subject.toLowerCase(),
    subjectPlural: terms.subjectPlural.toLowerCase(),
  };
}

export interface FieldNameMapping {
  unitFieldName: 'gradeLevel' | 'department' | 'courseCategory';
  subjectFieldName: 'subject' | 'unit' | 'category';
}

/**
 * Maps organization type to correct API field names
 * Education: gradeLevel, subject
 * Business: department, unit
 * E-Learning: courseCategory, category
 */
export function getFieldNames(orgType: OrganizationType = 'education'): FieldNameMapping {
  switch (orgType) {
    case 'education':
      return {
        unitFieldName: 'gradeLevel',
        subjectFieldName: 'subject',
      };
    case 'business':
      return {
        unitFieldName: 'department',
        subjectFieldName: 'unit',
      };
    case 'elearning':
      return {
        unitFieldName: 'courseCategory',
        subjectFieldName: 'category',
      };
  }
}
