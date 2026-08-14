import { useEffect } from "react";
import type { RealtimeChannel } from "@/lib/api";
import { api } from "@/lib/api";

type PostgresChangeHandler = (payload: unknown) => void;

type UseRealtimeOpts = {
  channel: string;
  schema?: string;
  table: string;
  filter?: string;
  enabled?: boolean;
  onChange: PostgresChangeHandler;
};

export function useRealtimeTable({
  channel,
  schema = "public",
  table,
  filter,
  enabled = true,
  onChange,
}: UseRealtimeOpts) {
  useEffect(() => {
    if (!enabled) return;

    let ch: RealtimeChannel | null = null;

    ch = api
      .channel(channel)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => onChange(payload),
      )
      .subscribe();

    return () => {
      if (ch) api.removeChannel(ch);
    };
  }, [channel, enabled, filter, onChange, schema, table]);
}
