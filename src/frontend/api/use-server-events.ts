import { useEffect, useRef } from "react";
import type { RunnerEvent } from "../../jobs/interfaces/runner-event.ts";
import type { ResourceStatus } from "../../server/interfaces/resource-status.ts";

export type ServerEvent = RunnerEvent | { type: "status"; status: ResourceStatus };

const runnerEventTypes = ["task", "job", "models"] as const;

/**
 * Listens to the server's event stream for as long as the component is mounted. EventSource reconnects
 * by itself after the server restarts; the handler may change between renders without reconnecting.
 */
export const useServerEvents = (onEvent: (event: ServerEvent) => void) => {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("status", (message) => {
      handler.current({ type: "status", status: JSON.parse(message.data) as ResourceStatus });
    });
    for (const type of runnerEventTypes) {
      source.addEventListener(type, (message) => handler.current(JSON.parse(message.data) as RunnerEvent));
    }
    return () => source.close();
  }, []);
};
