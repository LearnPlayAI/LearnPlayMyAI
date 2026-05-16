import { startOfMonth, endOfMonth, getDaysInMonth, differenceInDays, parseISO, isAfter, isBefore, isSameDay } from 'date-fns';
import { desc } from 'drizzle-orm';
import { db } from './db';
import { platformPricing } from '@shared/schema';

const MONTHLY_RATE_ZAR = 8.99; // Fallback default

/**
 * Fetch the current learner monthly cost from platform pricing settings
 * @returns Monthly rate from database or fallback to default
 */
export async function getPlatformLearnerRate(): Promise<number> {
  try {
    const [pricing] = await db
      .select()
      .from(platformPricing)
      .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
      .limit(1);
    if (pricing && pricing.learnerMonthlyCost) {
      return parseFloat(pricing.learnerMonthlyCost);
    }
  } catch (error) {
    console.error('[Billing] Failed to fetch platform pricing, using default:', error);
  }
  return MONTHLY_RATE_ZAR;
}

export interface StudentBillingInfo {
  userId: string;
  approvedAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
  proratedCost: number;
  daysRemaining: number;
  joinDate: string;
}

export interface MonthlyBillingReport {
  month: string;
  year: number;
  students: StudentBillingInfo[];
  totalStudents: number;
  totalCost: number;
  monthlyRate: number;
  daysInMonth: number;
}

/**
 * Calculate prorated cost for a student based on their join date
 * @param joinDate - Date when the student was approved (ISO string)
 * @param monthStart - Optional start of month to calculate for (defaults to current month)
 * @param monthlyRate - Monthly rate to use (defaults to MONTHLY_RATE_ZAR fallback)
 * @returns Prorated cost in ZAR
 */
export function calculateProratedCost(joinDate: string | Date, monthStart?: Date, monthlyRate: number = MONTHLY_RATE_ZAR): number {
  const join = typeof joinDate === 'string' ? parseISO(joinDate) : joinDate;
  const monthStartDate = monthStart || startOfMonth(new Date());
  const monthEndDate = endOfMonth(monthStartDate);
  const daysInMonth = getDaysInMonth(monthStartDate);
  
  // If student joined before this month, charge full month
  if (isBefore(join, monthStartDate)) {
    return monthlyRate;
  }
  
  // If student joined after this month, don't charge
  if (isAfter(join, monthEndDate)) {
    return 0;
  }
  
  // Calculate days remaining in month from join date (inclusive)
  const daysRemaining = differenceInDays(monthEndDate, join) + 1;
  
  // Calculate prorated cost
  const dailyRate = monthlyRate / daysInMonth;
  const proratedCost = dailyRate * daysRemaining;
  
  return Math.round(proratedCost * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate days remaining in month from a given date
 * @param joinDate - Date to calculate from
 * @param monthStart - Optional start of month to calculate for (defaults to current month)
 * @returns Number of days remaining (inclusive)
 */
export function getDaysRemainingInMonth(joinDate: string | Date, monthStart?: Date): number {
  const join = typeof joinDate === 'string' ? parseISO(joinDate) : joinDate;
  const monthStartDate = monthStart || startOfMonth(new Date());
  const monthEndDate = endOfMonth(monthStartDate);
  
  // If student joined before this month, return full month
  if (isBefore(join, monthStartDate)) {
    return getDaysInMonth(monthStartDate);
  }
  
  // If student joined after this month, return 0
  if (isAfter(join, monthEndDate)) {
    return 0;
  }
  
  // Calculate days remaining (inclusive)
  return differenceInDays(monthEndDate, join) + 1;
}

/**
 * Calculate total billing for all students in an organization for a given month
 * @param students - Array of students with join dates
 * @param month - Month to calculate for (0-11)
 * @param year - Year to calculate for
 * @param monthlyRate - Optional monthly rate override (defaults to MONTHLY_RATE_ZAR fallback)
 * @returns Monthly billing report
 */
export function calculateMonthlyBilling(
  students: Array<{ userId: string; approvedAt: string | null; firstName: string; lastName: string; email: string }>,
  month: number,
  year: number,
  monthlyRate: number = MONTHLY_RATE_ZAR
): MonthlyBillingReport {
  const monthStart = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(monthStart);
  
  const studentBillingInfo: StudentBillingInfo[] = students
    .filter(s => s.approvedAt) // Only include approved students
    .map(student => {
      const proratedCost = calculateProratedCost(student.approvedAt!, monthStart, monthlyRate);
      const daysRemaining = getDaysRemainingInMonth(student.approvedAt!, monthStart);
      
      return {
        userId: student.userId,
        approvedAt: student.approvedAt,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        proratedCost,
        daysRemaining,
        joinDate: student.approvedAt!,
      };
    })
    .filter(s => s.proratedCost > 0); // Only include students with charges this month
  
  const totalCost = studentBillingInfo.reduce((sum, s) => sum + s.proratedCost, 0);
  
  return {
    month: monthStart.toLocaleString('default', { month: 'long' }),
    year,
    students: studentBillingInfo,
    totalStudents: studentBillingInfo.length,
    totalCost: Math.round(totalCost * 100) / 100,
    monthlyRate,
    daysInMonth,
  };
}

/**
 * Get the billing breakdown for current month
 * @param students - Array of students with join dates
 * @param monthlyRate - Optional monthly rate override (defaults to MONTHLY_RATE_ZAR fallback)
 * @returns Monthly billing report for current month
 */
export function getCurrentMonthBilling(
  students: Array<{ userId: string; approvedAt: string | null; firstName: string; lastName: string; email: string }>,
  monthlyRate: number = MONTHLY_RATE_ZAR
): MonthlyBillingReport {
  const now = new Date();
  return calculateMonthlyBilling(students, now.getMonth(), now.getFullYear(), monthlyRate);
}

/**
 * Calculate projected monthly cost if all students were charged full month
 * @param studentCount - Number of active students
 * @param monthlyRate - Optional monthly rate override (defaults to MONTHLY_RATE_ZAR fallback)
 * @returns Projected full month cost
 */
export function calculateProjectedMonthlyCost(studentCount: number, monthlyRate: number = MONTHLY_RATE_ZAR): number {
  return Math.round(studentCount * monthlyRate * 100) / 100;
}

/**
 * Get monthly rate constant (deprecated - use getPlatformLearnerRate() for database pricing)
 * @returns Monthly rate fallback value in ZAR
 */
export function getMonthlyRate(): number {
  return MONTHLY_RATE_ZAR;
}
