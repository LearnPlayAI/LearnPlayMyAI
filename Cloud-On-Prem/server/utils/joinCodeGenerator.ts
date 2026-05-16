/**
 * Join Code Generator Utility
 * Generates unique, context-aware join codes for organizations, grades, and classes
 */

/**
 * Generate organization join code from organization name
 * Examples:
 * - "Bryanston High" -> "BRYHIGH"
 * - "St. Mary's School" -> "STMARY"
 * - "Tech Academy" -> "TECHACAD"
 */
export function generateOrgCode(orgName: string): string {
  // Remove special characters and split into words
  const cleanName = orgName.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(word => word.length > 0);

  if (words.length === 0) {
    throw new Error('Invalid organization name');
  }

  let code = '';

  if (words.length === 1) {
    // Single word: take first 8 characters
    code = words[0].substring(0, 8).toUpperCase();
  } else if (words.length === 2) {
    // Two words: take first 3-4 chars from each
    const first = words[0].substring(0, 4);
    const second = words[1].substring(0, 4);
    code = (first + second).substring(0, 8).toUpperCase();
  } else {
    // Multiple words: take first 2-3 chars from first 3 words
    code = words
      .slice(0, 3)
      .map((word, index) => {
        // First word gets 3 chars, others get 2-3
        return word.substring(0, index === 0 ? 3 : 2);
      })
      .join('')
      .substring(0, 8)
      .toUpperCase();
  }

  // Ensure minimum length of 3
  if (code.length < 3) {
    code = code.padEnd(3, 'X');
  }

  return code;
}

/**
 * Ensure join code is unique by checking existing codes and adding suffix if needed
 */
export function ensureUniqueCode(
  baseCode: string,
  existingCodes: string[]
): string {
  let uniqueCode = baseCode;
  let suffix = 2;

  while (existingCodes.includes(uniqueCode)) {
    uniqueCode = baseCode + suffix;
    suffix++;
  }

  return uniqueCode;
}

/**
 * Generate grade/unit join code
 * Format: {ORG}_G{number}
 * Example: BRYHIGH_G8 for Grade 8
 */
export function generateGradeCode(orgCode: string, gradeNumber: number): string {
  return `${orgCode}_G${gradeNumber}`;
}

/**
 * Generate class/sub-unit join code
 * Format: {ORG}_G{number}_C{letter}
 * Example: BRYHIGH_G8_CA for Grade 8 Class A
 */
export function generateClassCode(
  orgCode: string,
  gradeNumber: number,
  classLetter: string
): string {
  return `${orgCode}_G${gradeNumber}_C${classLetter.toUpperCase()}`;
}

/**
 * Get class letter from index (0='A', 1='B', etc.)
 */
export function getClassLetter(index: number): string {
  return String.fromCharCode(65 + index); // 65 is 'A' in ASCII
}

/**
 * Validate join code format
 */
export function validateJoinCode(code: string): boolean {
  // Join codes should be 3-20 characters, alphanumeric and underscores only
  const pattern = /^[A-Z0-9_]{3,20}$/;
  return pattern.test(code);
}

/**
 * Extract grade number from unit name
 * Examples:
 * - "Grade 8" -> 8
 * - "Grade 10" -> 10
 * - "8th Grade" -> 8
 * Returns null if no number found
 */
export function extractGradeNumber(unitName: string): number | null {
  const match = unitName.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Get the next available class letter based on existing sub-units
 * If sub-units already have Class A, B, C - returns 'D'
 */
export function getNextClassLetter(existingSubUnits: { name: string }[]): string {
  const classLetters = existingSubUnits
    .map(su => {
      const match = su.name.match(/Class ([A-Z])/i);
      return match ? match[1].toUpperCase() : null;
    })
    .filter(letter => letter !== null) as string[];
  
  if (classLetters.length === 0) {
    return 'A';
  }
  
  const maxLetter = classLetters.reduce((max, letter) => 
    letter > max ? letter : max
  );
  
  const nextCharCode = maxLetter.charCodeAt(0) + 1;
  return String.fromCharCode(nextCharCode);
}

/**
 * Generate abbreviated initials from a name
 * Examples:
 * - "Demo Department" -> "DD"
 * - "AI First" -> "AF"
 * - "Skills Development" -> "SD"
 * - "General" -> "GE"
 */
export function getNameInitials(name: string, maxChars: number = 2): string {
  const cleanName = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(word => word.length > 0);
  
  if (words.length === 0) {
    return 'XX';
  }
  
  if (words.length === 1) {
    return words[0].substring(0, maxChars).toUpperCase();
  }
  
  return words
    .slice(0, maxChars)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * Generate abbreviated org code (4 chars max)
 * Examples:
 * - "Morgens Conclusion" -> "MORG"
 * - "Bryanston High" -> "BRYH"
 */
export function getOrgInitials(orgName: string): string {
  const cleanName = orgName.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(word => word.length > 0);
  
  if (words.length === 0) {
    return 'ORG';
  }
  
  if (words.length === 1) {
    return words[0].substring(0, 4).toUpperCase();
  }
  
  const firstWord = words[0].substring(0, 2);
  const secondWord = words[1].substring(0, 2);
  return (firstWord + secondWord).toUpperCase();
}

/**
 * Generate abbreviated department join code
 * Format: {ORG_4CHARS}_{DEPT_INITIALS}
 * Example: "MORG_DD" for Morgens Conclusion -> Demo Department
 */
export function generateDepartmentCode(orgCode: string, departmentName: string): string {
  const orgPrefix = orgCode.substring(0, 4).toUpperCase();
  const deptInitials = getNameInitials(departmentName);
  return `${orgPrefix}_${deptInitials}`;
}

/**
 * Generate abbreviated unit join code
 * Format: {ORG_4CHARS}_{DEPT_INITIALS}_{UNIT_INITIALS}
 * Example: "MORG_DD_DU" for Demo Department -> Demo Unit
 */
export function generateUnitCode(deptCode: string, unitName: string): string {
  const unitInitials = getNameInitials(unitName);
  return `${deptCode}_${unitInitials}`;
}

/**
 * Generate abbreviated team join code
 * Format: {ORG_4CHARS}_{DEPT_INITIALS}_{UNIT_INITIALS}_{TEAM_INITIALS}
 * Example: "MORG_DD_DU_DT" for Demo Unit -> Demo Team
 */
export function generateTeamCode(unitCode: string, teamName: string): string {
  const teamInitials = getNameInitials(teamName);
  return `${unitCode}_${teamInitials}`;
}
