"use client";

import { conceptIds } from "@/contracts";
import { ROOM_COLOR } from "@/world/layout";
import { humanize } from "@/world/payloads";
import {
  assessmentFor,
  studentById,
  type RunProjection,
} from "@/world/runState";
import type { Selection } from "@/components/demo/useAtrium";
import { Chip, EmptyState, EvidenceList, KeyValue, LabelList, Meter, Section } from "./atoms";

export function StudentDetail({
  studentId,
  projection,
  onSelect,
}: {
  studentId: string;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
}) {
  const student = studentById(projection, studentId);
  const roomId = projection.studentRoom[studentId];
  const previousRoomId = projection.previousStudentRoom[studentId];
  const assessment = assessmentFor(projection, studentId);
  const supports = projection.supports[studentId] ?? student?.supports ?? [];

  if (!student) {
    return (
      <EmptyState
        title="Student not loaded yet"
        body="Student records arrive with the student.context.ready event. Start a run to populate the Memory Library."
      />
    );
  }

  const moved = previousRoomId && roomId && previousRoomId !== roomId;

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">{student.display_name}</h2>
          <p className="detail__subtitle">{student.student_id}</p>
        </div>
        {roomId && (
          <button
            type="button"
            className="room-pill"
            style={{ background: ROOM_COLOR[roomId] }}
            onClick={() => onSelect({ kind: "room", roomId })}
          >
            {humanize(roomId)}
          </button>
        )}
      </header>

      {moved && (
        <p className="detail__banner">
          Moved from {humanize(previousRoomId)} to {humanize(roomId)} after this
          assessment.
        </p>
      )}

      <Section
        title="Mastery"
        subtitle="Estimate and confidence per concept, from the Memory Library."
      >
        {conceptIds.map((conceptId) => {
          const estimate = student.mastery?.[conceptId];
          if (!estimate) return null;
          return (
            <Meter
              key={conceptId}
              label={humanize(conceptId)}
              value={estimate.score}
              hint={`confidence ${Math.round(estimate.confidence * 100)}% · trend ${estimate.trend}`}
            />
          );
        })}
      </Section>

      <Section
        title="Delivery supports"
        subtitle="Accessibility is a delivery layer. It never decides which room a student is in."
      >
        <LabelList values={supports} />
        <KeyValue label="Scaffolding level">
          <Chip tone="accent">{student.scaffolding_level} of 4</Chip>
        </KeyValue>
      </Section>

      <Section title="Recent patterns" subtitle="Misconceptions seen in prior work.">
        <LabelList values={student.recent_patterns ?? []} />
      </Section>

      {assessment && (
        <Section
          title="Latest assessment"
          subtitle={assessment.narrative}
          actions={
            assessment.human_review_required ? (
              <Chip tone="bad">Needs human review</Chip>
            ) : (
              <Chip tone="good">Auto-accepted</Chip>
            )
          }
        >
          <Meter label="Score" value={assessment.score} />
          <Meter
            label="Grader confidence"
            value={assessment.confidence}
            tone={assessment.confidence < 0.6 ? "bad" : undefined}
          />
          <KeyValue label="Misconceptions">
            <LabelList values={assessment.misconceptions ?? []} />
          </KeyValue>
          <KeyValue label="Evidence">
            <EvidenceList refs={assessment.evidence_refs ?? []} />
          </KeyValue>
        </Section>
      )}
    </div>
  );
}
