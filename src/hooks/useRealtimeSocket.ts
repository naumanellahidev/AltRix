import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";

export function useRealtimeSocket(
  onNewConversation?: (convo: any) => void,
  onNewMessage?: (msg: any) => void,
  onPresenceUpdate?: (presence: any) => void
) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const parkedRef = useRef(false);

  // Keep references to latest callbacks to avoid restarting websocket on render
  const callbacksRef = useRef({ onNewConversation, onNewMessage, onPresenceUpdate });
  useEffect(() => {
    callbacksRef.current = { onNewConversation, onNewMessage, onPresenceUpdate };
  }, [onNewConversation, onNewMessage, onPresenceUpdate]);

  useEffect(() => {
    let active = true;

    async function connect() {
      if (wsRef.current) return;

      try {
        setStatus("connecting");
        const { data: { session } } = await api.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          // Signed out (or not yet signed in): nothing to connect as, and
          // nothing wrong. Checked again after a pause.
          setStatus("disconnected");
          scheduleReconnect();
          return;
        }

        let host = window.location.host;
        let protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

        const envApiUrl = import.meta.env.VITE_API_URL || '';
        if (envApiUrl && envApiUrl.startsWith('http')) {
          try {
            const url = new URL(envApiUrl);
            host = url.host;
            protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          } catch (e) {
            console.warn("Failed to parse VITE_API_URL for WebSocket", e);
          }
        }

        // Trade the access token for a single-use, 30-second ticket over normal
        // HTTP first. Anything in a WebSocket URL ends up in proxy access logs,
        // and a redeemed ticket is worthless there; an access token is not.
        let ticket: string;
        try {
          const res = await apiClient.post("/realtime/ws-ticket");
          ticket = res.data?.ticket;
          if (!ticket) throw new Error("no ticket issued");
        } catch (e: any) {
          // Retried, not abandoned: a failed ticket used to end live updates
          // for this screen until it was reloaded.
          if (attemptsRef.current === 0) console.warn(`Collaboration live updates paused (${e?.message ?? e}); retrying.`);
          setStatus("disconnected");
          scheduleReconnect();
          return;
        }

        const wsUrl = `${protocol}//${host}/api/ws?ticket=${encodeURIComponent(ticket)}`;

        // Deliberately not logging the URL: it carries the credential.
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) {
            ws.close();
            return;
          }
          attemptsRef.current = 0;
          setStatus("connected");
          
          if (pingIntervalRef.current) window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          if (!active) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === "pong") {
              return;
            }
            if (parsed.type === "collaboration:new_conversation") {
              callbacksRef.current.onNewConversation?.(parsed.data);
            } else if (parsed.type === "collaboration:new_message") {
              callbacksRef.current.onNewMessage?.(parsed.data);
            } else if (parsed.type === "presence:update") {
              callbacksRef.current.onPresenceUpdate?.(parsed.data);
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        ws.onclose = (event) => {
          wsRef.current = null;
          if (pingIntervalRef.current) {
            window.clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (active && !parkedRef.current) {
            if (event.code !== 1000 && attemptsRef.current === 0) {
              console.warn(`Collaboration live updates paused (connection closed, code ${event.code}); retrying.`);
            }
            setStatus("disconnected");
            scheduleReconnect();
          }
        };

        // The close event that follows says what went wrong.
        ws.onerror = () => {
          ws.close();
        };

      } catch (err) {
        setStatus("disconnected");
        scheduleReconnect();
      }
    }

    // Backing off (3 s, 6 s, … 60 s), and waiting for the network rather than
    // retrying while offline.
    function scheduleReconnect() {
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (navigator.onLine === false) return;
      const delay = Math.min(3000 * 2 ** attemptsRef.current, 60000);
      attemptsRef.current += 1;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (active) connect();
      }, delay);
    }

    const onOnline = () => {
      attemptsRef.current = 0;
      if (active && !wsRef.current) connect();
    };
    // Parked in the back-forward cache: close cleanly, reconnect on return.
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted && wsRef.current) {
        parkedRef.current = true;
        wsRef.current.close(1000, "page hidden");
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        parkedRef.current = false;
        attemptsRef.current = 0;
        if (active && !wsRef.current) connect();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    connect();

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, []); // Only connect once on mount

  return { status };
}
