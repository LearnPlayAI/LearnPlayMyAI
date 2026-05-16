export interface Timezone {
  value: string;
  label: string;
  region: string;
}

export const TIMEZONES: Timezone[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', region: 'UTC' },
  { value: 'Etc/GMT', label: 'GMT (Greenwich Mean Time)', region: 'UTC' },

  { value: 'Africa/Casablanca', label: 'Casablanca (WET)', region: 'Africa' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'Lagos (WAT)', region: 'Africa' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT)', region: 'Africa' },

  { value: 'America/Bogota', label: 'Bogota (COT)', region: 'Americas' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)', region: 'Americas' },
  { value: 'America/Chicago', label: 'Chicago (CST)', region: 'Americas' },
  { value: 'America/Denver', label: 'Denver (MST)', region: 'Americas' },
  { value: 'America/Lima', label: 'Lima (PET)', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST)', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST)', region: 'Americas' },
  { value: 'America/New_York', label: 'New York (EST)', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)', region: 'Americas' },
  { value: 'America/Toronto', label: 'Toronto (EST)', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Vancouver (PST)', region: 'Americas' },

  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)', region: 'Asia' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', region: 'Asia' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia' },
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB)', region: 'Asia' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT)', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)', region: 'Asia' },
  { value: 'Asia/Manila', label: 'Manila (PHT)', region: 'Asia' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)', region: 'Asia' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia' },
  { value: 'Asia/Tehran', label: 'Tehran (IRST)', region: 'Asia' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', region: 'Asia' },

  { value: 'Australia/Adelaide', label: 'Adelaide (ACST)', region: 'Australia' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)', region: 'Australia' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)', region: 'Australia' },
  { value: 'Australia/Perth', label: 'Perth (AWST)', region: 'Australia' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', region: 'Australia' },

  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens (EET)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'Brussels (CET)', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)', region: 'Europe' },
  { value: 'Europe/London', label: 'London (GMT)', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris (CET)', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome (CET)', region: 'Europe' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET)', region: 'Europe' },
  { value: 'Europe/Vienna', label: 'Vienna (CET)', region: 'Europe' },
  { value: 'Europe/Warsaw', label: 'Warsaw (CET)', region: 'Europe' },

  { value: 'Pacific/Auckland', label: 'Auckland (NZST)', region: 'Pacific' },
  { value: 'Pacific/Fiji', label: 'Fiji (FJT)', region: 'Pacific' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (HST)', region: 'Pacific' },
];

export const TIMEZONE_REGIONS = ['UTC', 'Africa', 'Americas', 'Asia', 'Australia', 'Europe', 'Pacific'] as const;

export type TimezoneRegion = typeof TIMEZONE_REGIONS[number];

export function getTimezonesByRegion(): Record<TimezoneRegion, Timezone[]> {
  return TIMEZONES.reduce((acc, tz) => {
    const region = tz.region as TimezoneRegion;
    if (!acc[region]) {
      acc[region] = [];
    }
    acc[region].push(tz);
    return acc;
  }, {} as Record<TimezoneRegion, Timezone[]>);
}
