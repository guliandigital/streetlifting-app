import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from './auth/store.js';

const LIVE_WS_PROTOCOL = 'streetlifting-live.v1';
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;

type LiveUpdateMessage = {
  type: 'competition.updated';
  competitionId: string;
  occurredAt: string;
};

function isCompetitionUpdate(value: unknown, competitionId: string): value is LiveUpdateMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<LiveUpdateMessage>;
  return message.type === 'competition.updated' && message.competitionId === competitionId;
}

function websocketUrl(path: string): string {
  const url = new URL(`/api${path}`, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function useCompetitionLiveUpdates(id: string): void {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) return undefined;
    return connectCompetitionLiveUpdates({
      url: websocketUrl(`/live/competitions/${id}`),
      protocols: [LIVE_WS_PROTOCOL, accessToken],
      competitionId: id,
      onUpdate: () => {
        void queryClient.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
        void queryClient.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
        void queryClient.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      },
    });
  }, [accessToken, id, queryClient]);
}

export function usePublicCompetitionLiveUpdates(id: string): void {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      connectCompetitionLiveUpdates({
        url: websocketUrl(`/live/public/competitions/${id}`),
        protocols: LIVE_WS_PROTOCOL,
        competitionId: id,
        onUpdate: () => {
          void queryClient.invalidateQueries({
            queryKey: ['public-competitions', id, 'scoreboard'],
          });
        },
      }),
    [id, queryClient],
  );
}

function connectCompetitionLiveUpdates({
  url,
  protocols,
  competitionId,
  onUpdate,
}: {
  url: string;
  protocols: string | string[];
  competitionId: string;
  onUpdate: () => void;
}): () => void {
  let disposed = false;
  let retry = 0;
  let reconnectTimer: number | null = null;
  let socket: WebSocket | null = null;

  const connect = () => {
    if (disposed) return;
    socket = new WebSocket(url, protocols);
    socket.addEventListener('open', () => {
      retry = 0;
    });
    socket.addEventListener('message', (event) => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (isCompetitionUpdate(message, competitionId)) onUpdate();
      } catch {
        // The channel carries only invalidations. Ignore malformed frames.
      }
    });
    socket.addEventListener('close', (event) => {
      if (disposed) return;
      // Authorization/public-visibility rejections are terminal until the
      // user session or federation setting changes; do not reconnect forever.
      if (event.code === 1008) return;
      const delay = RETRY_DELAYS_MS[Math.min(retry, RETRY_DELAYS_MS.length - 1)]!;
      retry += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  connect();
  return () => {
    disposed = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
