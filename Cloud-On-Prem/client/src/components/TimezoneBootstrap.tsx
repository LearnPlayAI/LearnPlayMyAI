import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { installDateLocaleTimezonePatch, setActiveTimezone } from '@/utils/timezoneRuntime';

type ServerTimeResponse = {
  timezone?: string;
};

function detectBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function TimezoneBootstrap() {
  const { userPreferences, isAuthenticated } = useAuth();

  const { data: serverTime } = useQuery<ServerTimeResponse>({
    queryKey: ['/api/server-time'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/server-time', { credentials: 'include' });
      if (!res.ok) {
        return {};
      }
      return res.json();
    },
  });

  useEffect(() => {
    installDateLocaleTimezonePatch();
  }, []);

  useEffect(() => {
    const timezone =
      (isAuthenticated ? userPreferences?.timezone : null)
      || serverTime?.timezone
      || detectBrowserTimezone()
      || 'UTC';

    setActiveTimezone(timezone);
  }, [isAuthenticated, serverTime?.timezone, userPreferences?.timezone]);

  return null;
}

export default TimezoneBootstrap;
