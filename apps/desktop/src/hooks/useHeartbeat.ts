import { useEffect, useRef } from 'react';
import { useWSStore } from '../stores/wsStore.js';

interface HeartbeatHookParams {
  activeChannelIds: string[];
  enabled: boolean;
  intervalSeconds?: number;
}

export function useHeartbeat({
  activeChannelIds,
  enabled,
  intervalSeconds = 30,
}: HeartbeatHookParams) {
  const sendHeartbeat = useWSStore((state) => state.sendHeartbeat);
  const wsStatus = useWSStore((state) => state.status);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear existing interval on update
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || wsStatus !== 'connected' || activeChannelIds.length === 0) {
      return;
    }

    const triggerHeartbeats = () => {
      console.log(`[useHeartbeat] Enviando heartbeats para ${activeChannelIds.length} canais...`);
      
      // Send heartbeats with a slight stagger (100ms delay between each channel) to prevent spikes
      activeChannelIds.forEach((channelId, index) => {
        setTimeout(() => {
          sendHeartbeat(channelId);
        }, index * 100);
      });
    };

    // Run immediately on start
    triggerHeartbeats();

    // Setup interval
    intervalRef.current = setInterval(triggerHeartbeats, intervalSeconds * 1000) as any;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeChannelIds, enabled, wsStatus, intervalSeconds, sendHeartbeat]);
}
