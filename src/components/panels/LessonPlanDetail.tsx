"use client";

import { ROOM_COLOR } from "@/world/layout";
import { humanize } from "@/world/payloads";
import { studentById, type RunProjection } from "@/world/runState";
import type { Selection } from "@/components/demo/useAtrium";
import type { ConceptId, RoomId } from "@/contracts";
import { Chip, EmptyState, EvidenceList, KeyValue, LabelList, Section } from "./atoms";

type LessonPlanItemView = {
  item_id: string;
  title: string;
  room_id?: RoomId;
  student_ids?: string[];
  concept_focus?: ConceptId[];
  action: string;
  rationale: string;
  evidence_refs?: string[];
  minutes: number;
};

export function LessonPlanDetail({
  itemId,
  projection,
  onSelect,
}: {
  itemId: string;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
}) {
  const plan = projection.lessonPlan;
  const item = (plan?.items as LessonPlanItemView[] | undefined)?.find(
    (entry) => entry.item_id === itemId,
  );

  if (!plan || !item) {
    return (
      <EmptyState
        title="No plan item selected"
        body="Tomorrow's plan arrives with the lesson.plan.ready event. Run the classroom simulation to produce it."
      />
    );
  }

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">{item.title}</h2>
          <p className="detail__subtitle">Tomorrow · {item.minutes} minutes</p>
        </div>
        {item.room_id && (
          <button
            type="button"
            className="room-pill"
          style={{ background: ROOM_COLOR[item.room_id] }}
            onClick={() => onSelect({ kind: "room", roomId: item.room_id! })}
          >
            {humanize(item.room_id)}
          </button>
        )}
      </header>

      <Section title="What happens">
        <p className="prose">{item.action}</p>
      </Section>

      <Section title="Why" subtitle="Every plan item points back at evidence.">
        <p className="prose">{item.rationale}</p>
        <KeyValue label="Evidence">
          <EvidenceList refs={item.evidence_refs ?? []} />
        </KeyValue>
      </Section>

      <Section title="Concept focus">
        <LabelList values={item.concept_focus ?? []} />
      </Section>

      <Section title="Students">
        <div className="label-list">
          {(item.student_ids ?? []).length === 0 && (
            <Chip>Whole class</Chip>
          )}
          {(item.student_ids ?? []).map((studentId: string) => (
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
    </div>
  );
}

export function LessonPlanOverview({
  projection,
  onSelect,
}: {
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
}) {
  const plan = projection.lessonPlan;
  if (!plan) return null;

  return (
    <Section title="Tomorrow's plan" subtitle={plan.headline}>
      <ol className="plan-list">
        {(plan.items as LessonPlanItemView[]).map((item) => (
          <li key={item.item_id}>
            <button
              type="button"
              className="plan-item"
              onClick={() => onSelect({ kind: "plan_item", itemId: item.item_id })}
            >
              <span className="plan-item__title">{item.title}</span>
              <span className="plan-item__meta">
                {item.room_id ? humanize(item.room_id) : "Individual"} · {item.minutes}m
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}
