import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/contracts";
import {
  createEvent,
  emitEvent,
  getRunEvents,
  getSubscriberCount,
  publishEvent,
  resetEventBus,
  subscribeToRun,
} from "./bus";

const RUN = "run_test";

describe("event bus", () => {
  beforeEach(() => {
    resetEventBus();
  });

  it("stores published events in run history, in order", () => {
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    emitEvent({ run_id: RUN, event_type: "assignment.concepts.extracted", source_agent: "assignment_architect" });

    const events = getRunEvents(RUN);
    expect(events).toHaveLength(2);
    expect(events[0].event_type).toBe("assignment.uploaded");
    expect(events[1].event_type).toBe("assignment.concepts.extracted");
  });

  it("delivers events to multiple subscribers", () => {
    const first: AgentEvent[] = [];
    const second: AgentEvent[] = [];
    subscribeToRun(RUN, (event) => first.push(event));
    subscribeToRun(RUN, (event) => second.push(event));
    expect(getSubscriberCount(RUN)).toBe(2);

    const event = emitEvent({ run_id: RUN, event_type: "groups.proposed", source_agent: "grouping_agent" });

    expect(first).toEqual([event]);
    expect(second).toEqual([event]);
  });

  it("stops delivery after unsubscribe", () => {
    const seen: AgentEvent[] = [];
    const unsubscribe = subscribeToRun(RUN, (event) => seen.push(event));
    emitEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    unsubscribe();
    emitEvent({ run_id: RUN, event_type: "groups.proposed", source_agent: "grouping_agent" });

    expect(seen).toHaveLength(1);
    expect(getSubscriberCount(RUN)).toBe(0);
  });

  it("isolates events between runs", () => {
    emitEvent({ run_id: "run_a", event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    emitEvent({ run_id: "run_b", event_type: "assignment.uploaded", source_agent: "assignment_architect" });

    expect(getRunEvents("run_a")).toHaveLength(1);
    expect(getRunEvents("run_b")).toHaveLength(1);
    expect(getRunEvents("run_missing")).toEqual([]);
  });

  it("keeps delivering when one subscriber throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: AgentEvent[] = [];
    subscribeToRun(RUN, () => {
      throw new Error("bad subscriber");
    });
    subscribeToRun(RUN, (event) => seen.push(event));

    emitEvent({ run_id: RUN, event_type: "lesson.plan.ready", source_agent: "lesson_planner" });

    expect(seen).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("createEvent fills envelope fields and unique ids", () => {
    const one = createEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });
    const two = createEvent({ run_id: RUN, event_type: "assignment.uploaded", source_agent: "assignment_architect" });

    expect(one.event_id).not.toBe(two.event_id);
    expect(one.timestamp).toBeTruthy();
    expect(one.payload).toEqual({});
    // createEvent alone must not publish
    expect(getRunEvents(RUN)).toEqual([]);
    publishEvent(one);
    expect(getRunEvents(RUN)).toEqual([one]);
  });
});
