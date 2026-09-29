import { eventContracts, type GridlineEventName } from "./contracts.js";
import type { Bus, BusOptions, BusProblem, Handler } from "./types.js";

const warn = (problem: BusProblem): void => {
  console.warn("[gridline/bus]", problem);
};

export function createBus(options: BusOptions = {}): Bus {
  const onProblem = options.onProblem ?? warn;
  const handlers = new Map<GridlineEventName, Set<Handler<never>>>();

  return {
    publish(event, payload) {
      const parsed = eventContracts[event].safeParse(payload);
      if (!parsed.success) {
        onProblem({
          kind: "invalid-publish",
          event,
          issues: parsed.error.message,
        });
        return false;
      }

      for (const handler of handlers.get(event) ?? []) {
        // Parsed per subscriber, not once: zod returns a clone, so this is what
        // gives each handler its own copy and stops one that mutates the payload
        // from affecting the next. The failure branch guards ingress that did
        // not come through publish.
        const received = eventContracts[event].safeParse(parsed.data);
        if (!received.success) {
          onProblem({
            kind: "invalid-receive",
            event,
            issues: received.error.message,
          });
          continue;
        }
        try {
          // `event` is a value here, so its payload type can't be narrowed from
          // the union the map is keyed by; the schema above is the real check.
          (handler as (payload: unknown) => void)(received.data);
        } catch (error) {
          onProblem({ kind: "handler-threw", event, error });
        }
      }

      return true;
    },

    subscribe(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as Handler<never>);
      return () => {
        set.delete(handler as Handler<never>);
      };
    },
  };
}

/** The shared channel. Platform is a federation singleton, so this is one instance per page. */
export const bus: Bus = createBus();
