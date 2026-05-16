/**
 * Enhanced stat comparison utilities for card games
 * Handles different comparison types including negative values
 */

export type ComparisonType = "highest" | "closest_to_zero";

/**
 * Compare two stat values based on the comparison type
 * @param value1 First value to compare
 * @param value2 Second value to compare  
 * @param comparisonType Type of comparison ("highest" or "closest_to_zero")
 * @returns 1 if value1 wins, -1 if value2 wins, 0 if tie
 */
export function compareStatValues(
  value1: number, 
  value2: number, 
  comparisonType: ComparisonType = "highest"
): number {
  // Handle exact ties first
  if (value1 === value2) {
    return 0;
  }

  if (comparisonType === "closest_to_zero") {
    // For "closest to zero" comparison (used for atomic properties like melting points)
    
    // If one is positive and one is negative, positive always wins
    if (value1 >= 0 && value2 < 0) return 1;
    if (value2 >= 0 && value1 < 0) return -1;
    
    // If both are positive, higher value wins
    if (value1 >= 0 && value2 >= 0) {
      return value1 > value2 ? 1 : -1;
    }
    
    // If both are negative, closer to zero (less negative) wins
    // Example: -259.1 beats -360.9 because -259.1 is closer to zero
    if (value1 < 0 && value2 < 0) {
      return Math.abs(value1) < Math.abs(value2) ? 1 : -1;
    }
  }
  
  // Default "highest" comparison - simple numeric comparison
  return value1 > value2 ? 1 : -1;
}

/**
 * Determine the winner from an array of player values
 * @param playerValues Array of {playerId, value} objects
 * @param comparisonType Type of comparison to use
 * @returns Array of winning player IDs (can be multiple for ties)
 */
export function determineWinners(
  playerValues: Array<{playerId: string, value: number}>,
  comparisonType: ComparisonType = "highest"
): string[] {
  if (playerValues.length === 0) return [];
  if (playerValues.length === 1) return [playerValues[0].playerId];

  // Find the best value based on comparison type
  let bestValue = playerValues[0].value;
  let winners = [playerValues[0].playerId];

  for (let i = 1; i < playerValues.length; i++) {
    const comparison = compareStatValues(playerValues[i].value, bestValue, comparisonType);
    
    if (comparison > 0) {
      // New winner found
      bestValue = playerValues[i].value;
      winners = [playerValues[i].playerId];
    } else if (comparison === 0) {
      // Tie - add to winners list
      winners.push(playerValues[i].playerId);
    }
    // If comparison < 0, current best remains
  }

  return winners;
}

/**
 * Format stat values for display
 * Only shows decimals when the value actually has decimal places
 * @param value The numeric value to format
 * @returns Formatted string
 */
export function formatStatValue(value: number | string): string {
  // If it's already a string, try to preserve the original precision
  if (typeof value === 'string') {
    const numValue = parseFloat(value);
    
    // Handle invalid numbers
    if (isNaN(numValue)) return '0';
    
    // If it's a whole number, return without decimals
    if (numValue % 1 === 0) {
      return numValue.toString();
    }
    
    // For string inputs, preserve the original formatting but remove unnecessary trailing zeros
    return value.replace(/\.?0+$/, '');
  }
  
  // For numeric inputs
  const numValue = value;
  
  // Handle invalid numbers
  if (isNaN(numValue)) return '0';
  
  // If it's a whole number, return without decimals
  if (numValue % 1 === 0) {
    return numValue.toString();
  }
  
  // For decimal numbers, convert to string and preserve precision
  let str = numValue.toString();
  
  // If the number was converted to scientific notation, use toFixed to get full decimal
  if (str.includes('e')) {
    str = numValue.toFixed(10); // Use enough precision to capture the actual value
  }
  
  // Remove trailing zeros, but preserve the actual decimal precision
  return str.replace(/\.?0+$/, '');
}