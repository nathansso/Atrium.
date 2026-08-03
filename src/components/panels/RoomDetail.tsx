"use client";

import type { RoomId } from "@/contracts";
import { ROOM_COLOR } from "@/world/layout";
import { humanize } from "@/world/payloads";
import {
  membersOfRoom,
  roomById,
  roomCounts,
  variantForRoom,
  type RunProjection,
} from "@/world/runState";
import type { Selection } from "@/components/demo/useAtrium";
import { Chip, EmptyState, EvidenceList, KeyValue, LabelList, Section } from "./atoms";

export function RoomDetail({
  roomId,
  projection,
  onSelect,
}: {
  roomId: RoomId;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
}) {
  const room = roomById(projection, roomId);
  const members = membersOfRoom(projection, roomId);
  const counts = roomCounts(projection, roomId);
  const variant = variantForRoom(projection, roomId);

  if (!room) {
    return (
      <EmptyState
        title={`${humanize(roomId)} has not been built yet`}
        body="Rooms appear when the grouping agent emits groups.proposed. Start a run to see the plot become a room."
      />
    );
  }

  const delta = counts.after - counts.before;

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">
            <span
              className="detail__swatch"
              style={{ background: ROOM_COLOR[roomId] }}
              aria-hidden="true"
            />
            {room.name}
          </h2>
          <p className="detail__subtitle">Temporary learning room</p>
        </div>
        <Chip tone="accent">
          {counts.after} student{counts.after === 1 ? "" : "s"}
          {delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}
        </Chip>
      </header>

      <Section
        title="Dominant barrier"
        subtitle="Rooms are formed by the barrier a student is facing right now, never by a diagnosis or an accommodation label."
      >
        <p className="prose">{room.dominant_barrier}</p>
      </Section>

      <Section title="Why these students" subtitle="Grouping agent explanation.">
        <p className="prose">{room.explanation}</p>
        <KeyValue label="Evidence">
          <EvidenceList refs={room.evidence_refs ?? []} />
        </KeyValue>
      </Section>

      <Section title="Focus concepts">
        <LabelList values={room.focus_concepts ?? []} />
      </Section>

      <Section title="Base adaptation" subtitle="Applied to every student in the room.">
        <p className="prose">{room.base_adaptation}</p>
        {variant && (
          <KeyValue label="Objective preserved">
            {variant.objective_preserved ? (
              <Chip tone="good">Yes — {variant.objective_statement}</Chip>
            ) : (
              <Chip tone="bad">No</Chip>
            )}
          </KeyValue>
        )}
      </Section>

      <Section title="Members" subtitle="Click a student to open their record.">
        <div className="member-grid">
          {members.length === 0 && <span className="muted">No students placed yet.</span>}
          {members.map((student) => (
            <button
              key={student.student_id}
              type="button"
              className="member"
              onClick={() => onSelect({ kind: "student", studentId: student.student_id })}
            >
              <span className="member__name">{student.display_name}</span>
              <span className="member__meta">
                {(projection.supports[student.student_id] ?? student.supports ?? []).length}{" "}
                support layer(s)
              </span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
