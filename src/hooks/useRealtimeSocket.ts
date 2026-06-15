import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeSocket(
  onNewConversation?: (convo: any) => void,
  onNewMessage?: (msg: any) => void,
  onPresenceUpdate?: (presence: any) => void
) {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

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
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          console.warn("No Supabase session found for WebSocket auth");
          setStatus("disconnected");
          scheduleReconnect();
          return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/ws?token=${encodeURIComponent(token)}`;

        console.log("Connecting to WebSocket:", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!active) {
            ws.close();
            return;
          }
          console.log("WebSocket connected successfully");
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
          if (active) {
            console.warn(`WebSocket closed: ${event.reason}. Reconnecting in 3s...`);
            setStatus("disconnected");
            scheduleReconnect();
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          ws.close();
        };

      } catch (err) {
        console.error("WebSocket connection failed:", err);
        setStatus("disconnected");
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (active) connect();
      }, 3000);
    }

    connect();

    return () => {
      active = false;
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
