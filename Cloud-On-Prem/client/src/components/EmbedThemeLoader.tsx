import { useState, useEffect, useCallback, ReactNode } from 'react';

interface EmbedThemeLoaderProps {
  orgId: string;
  baseUrl?: string;
  children?: ReactNode;
  fallback?: ReactNode;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

interface EmbedThemeState {
  isLoading: boolean;
  isLoaded: boolean;
  error: Error | null;
}

export function EmbedThemeLoader({
  orgId,
  baseUrl = '',
  children,
  fallback,
  onLoad,
  onError,
}: EmbedThemeLoaderProps) {
  const [state, setState] = useState<EmbedThemeState>({
    isLoading: true,
    isLoaded: false,
    error: null,
  });

  const loadTheme = useCallback(async () => {
    if (!orgId) {
      setState({ isLoading: false, isLoaded: true, error: null });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const stylesheetUrl = `${baseUrl}/api/theme/embed-styles?orgId=${encodeURIComponent(orgId)}`;
      
      const existingLink = document.querySelector(`link[data-embed-theme="${orgId}"]`);
      if (existingLink) {
        existingLink.remove();
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheetUrl;
      link.setAttribute('data-embed-theme', orgId);
      link.setAttribute('crossorigin', 'anonymous');

      await new Promise<void>((resolve, reject) => {
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load theme styles from ${stylesheetUrl}`));
        document.head.appendChild(link);
      });

      setState({ isLoading: false, isLoaded: true, error: null });
      onLoad?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load theme');
      setState({ isLoading: false, isLoaded: false, error });
      onError?.(error);
    }
  }, [orgId, baseUrl, onLoad, onError]);

  useEffect(() => {
    loadTheme();

    return () => {
      const link = document.querySelector(`link[data-embed-theme="${orgId}"]`);
      if (link) {
        link.remove();
      }
    };
  }, [orgId, loadTheme]);

  if (state.isLoading && fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function useEmbedTheme(orgId: string, baseUrl: string = '') {
  const [state, setState] = useState<EmbedThemeState>({
    isLoading: true,
    isLoaded: false,
    error: null,
  });

  const loadTheme = useCallback(async () => {
    if (!orgId) {
      setState({ isLoading: false, isLoaded: true, error: null });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const stylesheetUrl = `${baseUrl}/api/theme/embed-styles?orgId=${encodeURIComponent(orgId)}`;
      
      const existingLink = document.querySelector(`link[data-embed-theme="${orgId}"]`);
      if (existingLink) {
        existingLink.remove();
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheetUrl;
      link.setAttribute('data-embed-theme', orgId);
      link.setAttribute('crossorigin', 'anonymous');

      await new Promise<void>((resolve, reject) => {
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load theme styles from ${stylesheetUrl}`));
        document.head.appendChild(link);
      });

      setState({ isLoading: false, isLoaded: true, error: null });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load theme');
      setState({ isLoading: false, isLoaded: false, error });
    }
  }, [orgId, baseUrl]);

  useEffect(() => {
    loadTheme();

    return () => {
      const link = document.querySelector(`link[data-embed-theme="${orgId}"]`);
      if (link) {
        link.remove();
      }
    };
  }, [orgId, loadTheme]);

  const reload = useCallback(() => {
    loadTheme();
  }, [loadTheme]);

  return {
    isLoading: state.isLoading,
    isLoaded: state.isLoaded,
    error: state.error,
    reload,
  };
}

export function getEmbedStylesheetUrl(orgId: string, baseUrl: string = ''): string {
  return `${baseUrl}/api/theme/embed-styles?orgId=${encodeURIComponent(orgId)}`;
}

export function getEmbedStylesheetLink(orgId: string, baseUrl: string = ''): string {
  const url = getEmbedStylesheetUrl(orgId, baseUrl);
  return `<link rel="stylesheet" href="${url}" crossorigin="anonymous">`;
}
