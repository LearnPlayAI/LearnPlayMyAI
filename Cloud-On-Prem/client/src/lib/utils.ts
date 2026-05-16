import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  gamerName?: string;
  email?: string;
}, context: 'admin' | 'leaderboard' = 'admin'): string {
  if (context === 'leaderboard') {
    return user.gamerName || 'Unknown';
  }
  
  // Admin context: show personal name if available, with gamer name as fallback
  const personalName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.firstName || null;
  
  const gamerName = user.gamerName;
  
  if (personalName && gamerName) {
    return `${personalName} (${gamerName})`;
  }
  
  if (personalName) {
    return personalName;
  }
  
  if (gamerName) {
    return gamerName;
  }
  
  if (user.email) {
    const emailName = user.email.split('@')[0];
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }
  
  return 'Unknown';
}
