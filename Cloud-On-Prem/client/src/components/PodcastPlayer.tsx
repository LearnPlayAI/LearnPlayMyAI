import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type PodcastPlaybackResponse = {
  lessonId: string;
  playbackType?: "hls" | "mp3";
  hlsUrl?: string | null;
  mp3Url?: string | null;
  hlsErrorMessage?: string | null;
  url?: string | null;
};

const PODCAST_PLAYER_PLAY_EVENT = "learnplay:podcast-player-play";

interface PodcastPlayerProps {
  lessonId: string;
  versionId?: string | null;
  languageCode?: string | null;
  className?: string;
  dataTestId?: string;
  debugContext?: string;
}

export function PodcastPlayer({ lessonId, versionId, languageCode, className, dataTestId, debugContext }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerIdRef = useRef(`podcast-player-${Math.random().toString(36).slice(2)}`);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const debugQueueRef = useRef<any[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const lastSeekTargetRef = useRef<number | null>(null);

  const isDebugEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get("podcastDebug") === "1") return true;
    try {
      return window.localStorage.getItem("podcastDebug") === "1";
    } catch {
      return false;
    }
  }, []);

  const shouldPreferHlsJs = useMemo(() => {
    if (typeof window === "undefined") return true;
    const ua = window.navigator.userAgent || "";
    const isSafari = /Safari/i.test(ua) && !/(Chrome|Chromium|Edg|OPR|CriOS|FxiOS)/i.test(ua);
    return !isSafari;
  }, []);

  const recordDebug = (category: string, details?: Record<string, any>) => {
    if (!isDebugEnabled) return;
    const event = {
      timestamp: new Date().toISOString(),
      category,
      lessonId,
      versionId: versionId || undefined,
      languageCode: languageCode || undefined,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      message: debugContext || undefined,
      details: {
        ...details,
        context: debugContext || undefined,
      },
    };
    debugQueueRef.current.push(event);
    if (debugQueueRef.current.length > 200) {
      debugQueueRef.current.splice(0, debugQueueRef.current.length - 200);
    }
    if (flushTimerRef.current == null) {
      flushTimerRef.current = window.setTimeout(() => {
        const batch = debugQueueRef.current.splice(0, 40);
        flushTimerRef.current = null;
        if (batch.length === 0) return;
        fetch("/api/podcast-debug/events", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
        }).catch(() => undefined);
      }, 1200);
    }
  };

  useEffect(() => {
    return () => {
      if (!isDebugEnabled) return;
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      const batch = debugQueueRef.current.splice(0, 40);
      if (batch.length === 0) return;
      fetch("/api/podcast-debug/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
      }).catch(() => undefined);
    };
  }, [isDebugEnabled]);

  const { data, error, isError, isLoading } = useQuery<PodcastPlaybackResponse>({
    queryKey: ["/api/lessons", lessonId, "podcast/playback", { versionId: versionId || undefined, languageCode: languageCode || undefined }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (versionId) params.set("versionId", versionId);
      if (languageCode) params.set("languageCode", languageCode);
      return apiRequest(`/api/lessons/${lessonId}/podcast/playback${params.toString() ? `?${params.toString()}` : ""}`);
    },
    enabled: !!lessonId,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const playback = query.state.data as PodcastPlaybackResponse | undefined;
      if (!playback) return 2_500;
      if (playback.playbackType === "hls" && playback.hlsUrl) return false;
      if (playback.playbackType === "mp3" && (playback.mp3Url || playback.url)) return false;
      return 4_000;
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });

  const hlsUrl = String(data?.hlsUrl || "").trim();
  const mp3Url = String(data?.mp3Url || "").trim();
  const shouldUseHls = data?.playbackType === "hls" && !!hlsUrl;

  useEffect(() => {
    setPlaybackError(null);
    const audioEl = audioRef.current;
    if (!audioEl) return;
    audioEl.pause();
    lastSeekTargetRef.current = null;
    audioEl.removeAttribute("src");
    audioEl.load();
  }, [lessonId, versionId, languageCode]);

  useEffect(() => {
    let destroyed = false;
    let hlsInstance: any = null;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const normalizeSource = (src: string) => {
      try {
        return new URL(src, window.location.origin).toString();
      } catch {
        return src;
      }
    };

    const setSource = (src: string) => {
      if (!src) return;
      const normalizedTarget = normalizeSource(src);
      const normalizedCurrent = normalizeSource(audioEl.currentSrc || audioEl.src || "");
      if (normalizedCurrent !== normalizedTarget) {
        const wasPlaying = !audioEl.paused;
        recordDebug("audio_set_source", {
          src: normalizedTarget,
          wasPlaying,
          currentSrc: normalizedCurrent || "",
        });
        audioEl.src = normalizedTarget;
        audioEl.load();
        if (wasPlaying) {
          audioEl.play().catch(() => undefined);
        }
      }
    };

    if (!shouldUseHls) {
      if (mp3Url) {
        setSource(mp3Url);
        return () => undefined;
      }
      setPlaybackError(
        String(data?.hlsErrorMessage || "").trim() || "Podcast stream is still preparing. Please refresh in a moment."
      );
      return () => undefined;
    }

    if (!shouldPreferHlsJs && audioEl.canPlayType("application/vnd.apple.mpegurl")) {
      recordDebug("hls_native_selected", { hlsUrl });
      setSource(hlsUrl);
      return () => undefined;
    }

    import("hls.js")
      .then((mod) => {
        if (destroyed) return;
        const HlsClass: any = (mod as any).default || mod;
        if (!HlsClass?.isSupported?.()) {
          recordDebug("hls_js_not_supported", {});
          setPlaybackError("Your browser does not support HLS podcast playback.");
          return;
        }
        recordDebug("hls_js_selected", { hlsUrl });
        hlsInstance = new HlsClass({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });
        hlsInstance.loadSource(hlsUrl);
        hlsInstance.attachMedia(audioEl);
        hlsInstance.on(HlsClass.Events.LEVEL_LOADED, (_event: any, payload: any) => {
          recordDebug("hls_level_loaded", {
            live: payload?.details?.live,
            totalDuration: payload?.details?.totalduration,
            fragments: Array.isArray(payload?.details?.fragments) ? payload.details.fragments.length : undefined,
          });
        });
        hlsInstance.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
          recordDebug("hls_error", {
            fatal: !!data?.fatal,
            type: data?.type,
            details: data?.details,
            reason: data?.reason,
          });
          if (!data?.fatal) return;
          setPlaybackError("Podcast playback failed. Please refresh and try again.");
        });
      })
      .catch(() => {
        recordDebug("hls_dynamic_import_failed", {});
        if (!destroyed) setPlaybackError("Podcast playback initialization failed.");
      });

    return () => {
      destroyed = true;
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {
          // no-op
        }
      }
    };
  }, [hlsUrl, mp3Url, shouldUseHls, data?.hlsErrorMessage, shouldPreferHlsJs]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !isDebugEnabled) return;
    const getBufferedRanges = () => {
      try {
        const out: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < audioEl.buffered.length; i += 1) {
          out.push({
            start: Number(audioEl.buffered.start(i).toFixed(3)),
            end: Number(audioEl.buffered.end(i).toFixed(3)),
          });
        }
        return out;
      } catch {
        return [];
      }
    };

    const emit = (category: string) => {
      recordDebug(category, {
        currentTime: Number((audioEl.currentTime || 0).toFixed(3)),
        duration: Number.isFinite(audioEl.duration) ? Number(audioEl.duration.toFixed(3)) : null,
        readyState: audioEl.readyState,
        networkState: audioEl.networkState,
        seekableLength: audioEl.seekable?.length || 0,
        buffered: getBufferedRanges(),
        playbackType: data?.playbackType || null,
      });
    };

    const onLoadedMetadata = () => emit("audio_loadedmetadata");
    const onCanPlay = () => emit("audio_canplay");
    const onSeeking = () => {
      lastSeekTargetRef.current = audioEl.currentTime;
      emit("audio_seeking");
    };
    const onSeeked = () => {
      const target = lastSeekTargetRef.current;
      emit("audio_seeked");
      if (target != null) {
        const delta = Math.abs((audioEl.currentTime || 0) - target);
        if (delta > 2) {
          recordDebug("audio_seek_snapback", {
            targetTime: Number(target.toFixed(3)),
            settledTime: Number((audioEl.currentTime || 0).toFixed(3)),
            delta: Number(delta.toFixed(3)),
          });
        }
      }
    };
    const onStalled = () => emit("audio_stalled");
    const onWaiting = () => emit("audio_waiting");
    const onError = () => emit("audio_error");
    const onDurationChange = () => emit("audio_durationchange");

    audioEl.addEventListener("loadedmetadata", onLoadedMetadata);
    audioEl.addEventListener("canplay", onCanPlay);
    audioEl.addEventListener("seeking", onSeeking);
    audioEl.addEventListener("seeked", onSeeked);
    audioEl.addEventListener("stalled", onStalled);
    audioEl.addEventListener("waiting", onWaiting);
    audioEl.addEventListener("error", onError);
    audioEl.addEventListener("durationchange", onDurationChange);

    recordDebug("audio_debug_attached", {
      dataTestId,
      context: debugContext || undefined,
    });

    return () => {
      audioEl.removeEventListener("loadedmetadata", onLoadedMetadata);
      audioEl.removeEventListener("canplay", onCanPlay);
      audioEl.removeEventListener("seeking", onSeeking);
      audioEl.removeEventListener("seeked", onSeeked);
      audioEl.removeEventListener("stalled", onStalled);
      audioEl.removeEventListener("waiting", onWaiting);
      audioEl.removeEventListener("error", onError);
      audioEl.removeEventListener("durationchange", onDurationChange);
    };
  }, [isDebugEnabled, data?.playbackType, lessonId, versionId, languageCode, dataTestId, debugContext]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || typeof window === "undefined") return;

    const announcePlayback = () => {
      window.dispatchEvent(
        new CustomEvent(PODCAST_PLAYER_PLAY_EVENT, {
          detail: {
            playerId: playerIdRef.current,
            lessonId,
            versionId: versionId || null,
            languageCode: languageCode || null,
          },
        })
      );
    };

    const pauseWhenAnotherPodcastStarts = (event: CustomEvent<{ playerId?: string }>) => {
      if (event.detail?.playerId === playerIdRef.current) return;
      if (!audioEl.paused) {
        audioEl.pause();
      }
    };

    audioEl.addEventListener("play", announcePlayback);
    window.addEventListener(PODCAST_PLAYER_PLAY_EVENT, pauseWhenAnotherPodcastStarts as EventListener);

    return () => {
      audioEl.removeEventListener("play", announcePlayback);
      window.removeEventListener(PODCAST_PLAYER_PLAY_EVENT, pauseWhenAnotherPodcastStarts as EventListener);
    };
  }, [lessonId, versionId, languageCode]);

  if (!lessonId) return null;
  if (isError) {
    const message = (error as any)?.message || "Podcast playback is unavailable right now.";
    return <p className="text-xs text-muted-foreground">{message}</p>;
  }
  if (isLoading && !data) {
    return <p className="text-xs text-muted-foreground">Preparing podcast playback…</p>;
  }
  if (playbackError) {
    return <p className="text-xs text-muted-foreground">{playbackError}</p>;
  }
  return (
    <audio
      ref={audioRef}
      controls
      className={className}
      data-testid={dataTestId}
      preload="metadata"
    />
  );
}

export default PodcastPlayer;
