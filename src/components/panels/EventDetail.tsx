"use client";

import { useMemo, useState } from "react";
import { roomIds, type RoomId } from "@/contracts";
import { humanize } from "@/world/payloads";
import { studentById, type RunProjection } from "@/world/runState";
import type { Selection } from "@/components/demo/useAtrium";
import { Chip, EmptyState, KeyValue, Section } from "./atoms";

/** Walk a payload and collect the ids it mentions, so they can be clicked. */
function collectRefs(value: unknown, students: Set<string>, rooms: Set<RoomId>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, students, rooms);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "student_id" && typeof entry === "string") students.add(entry);
    if (key === "student_ids" && Array.isArray(entry)) {
      for (const id of entry) if (typeof id === "string") students.add(id);
    }
    if (key === "members" && Array.isArray(entry)) {
      for (const id of entry) if (typeof id === "string") students.add(id);
    }
    if (
      (key === "room_id" || key === "to_room" || key === "from_room") &&
      typeof entry === "string" &&
      (roomIds as readonly string[]).includes(entry)
    ) {
      rooms.add(entry as RoomId);
    }
    collectRefs(entry, students, rooms);
  }
}

export function EventDetail({
  eventId,
  projection,
  onSelect,
}: {
  eventId: string;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
}) {
  const event = projection.events.find((entry) => entry.event_id === eventId);
  const [expanded, setExpanded] = useState(false);

  const refs = useMemo(() => {
    const students = new Set<string>();
    const rooms = new Set<RoomId>();
    if (event) collectRefs(event.payload, students, rooms);
    return { students: Array.from(students), rooms: Array.from(rooms) };
  }, [event]);

  if (!event) {
    return (
      <EmptyState
        title="Event not found"
        body="Pick an event from the agent feed to inspect its structured payload."
      />
    );
  }

  const json = JSON.stringify(event.payload, null, 2);
  const truncated = !expanded && json.length > 2400;

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">{event.event_type}</h2>
          <p className="detail__subtitle">{event.event_id}</p>
        </div>
        <Chip tone="accent">{humanize(event.source_agent)}</Chip>
      </header>

      <Section title="Envelope">
        <KeyValue label="Run">
          <code>{event.run_id}</code>
        </KeyValue>
        <KeyValue label="Source agent">
          <code>{event.source_agent}</code>
        </KeyValue>
        <KeyValue label="Timestamp">
          <code>{event.timestamp}</code>
        </KeyValue>
      </Section>

      {(refs.students.length > 0 || refs.rooms.length > 0) && (
        <Section
          title="Referenced in this payload"
          subtitle="Click to jump to the record."
        >
          <div className="label-list">
            {refs.rooms.map((roomId) => (
              <button
                key={roomId}
                type="button"
                className="chip-button chip-button--tiny"
                onClick={() => onSelect({ kind: "room", roomId })}
              >
                {humanize(roomId)}
              </button>
            ))}
            {refs.students.map((studentId) => (
              <button
                key={studentId}
                type="button"
                className="chip-button chip-button--tiny"
                onClick={() => onSelect({ kind: "student", studentId })}
              >
                {studentById(projection, studentId)?.display_name ?? studentId}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Payload"
        subtitle="Exactly the JSON that crossed the event bus."
        actions={
          json.length > 2400 && (
            <button
              type="button"
              className="chip-button chip-button--tiny"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )
        }
      >
        <pre className="json">{truncated ? `${json.slice(0, 2400)}\n…` : json}</pre>
      </Section>
    </div>
  );
}
