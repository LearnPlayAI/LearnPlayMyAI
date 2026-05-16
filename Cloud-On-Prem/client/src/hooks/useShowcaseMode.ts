import { useAuth } from './useAuth';

export interface UseShowcaseModeResult {
  isShowcaseMode: boolean;
  isAuthenticated: boolean;
}

export function useShowcaseMode(): UseShowcaseModeResult {
  const { isAuthenticated } = useAuth();

  return {
    isShowcaseMode: !isAuthenticated,
    isAuthenticated,
  };
}
