"use client";

import { agentNames } from "@/contracts";
import { getBuilding } from "@/world/layout";
import { humanize } from "@/world/payloads";
import type { RunProjection } from "@/world/runState";
import type { BuildingId } from "@/world/types";
import type { Selection } from "@/components/demo/useAtrium";
import { LessonPlanOverview } from "./LessonPlanDetail";
import { Chip, EmptyState, EvidenceList, KeyValue, LabelList, Meter, Section } from "./atoms";

function reviewConfidence(item: { confidence?: unknown; reason: string }): number | null {
  if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) {
    return Math.min(1, Math.max(0, item.confidence));
  }
  const match = item.reason.match(/confidence\s+([0-9.]+)/i);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : null;
}

export function BuildingDetail({
  id,
  projection,
  onSelect,
  onApprove,
}: {
  id: BuildingId;
  projection: RunProjection;
  onSelect: (selection: Selection) => void;
  onApprove: (reviewId: string) => void;
}) {
  const spec = getBuilding(id);

  return (
    <div className="detail">
      <header className="detail__head">
        <div>
          <h2 className="detail__title">{spec.label}</h2>
          <p className="detail__subtitle">{spec.caption}</p>
        </div>
      </header>
      {renderBody(id, projection, onSelect, onApprove)}
    </div>
  );
}

function renderBody(
  id: BuildingId,
  projection: RunProjection,
  onSelect: (selection: Selection) => void,
  onApprove: (reviewId: string) => void,
) {
  switch (id) {
    case "professor_tower": {
      const assignment = projection.assignment;
      if (!assignment) {
        return (
          <EmptyState
            title="No assignment uploaded"
            body="Paste or upload an assignment in the command rail, then start a run."
          />
        );
      }
      return (
        <>
          <Section title={assignment.title} subtitle={`${assignment.subject} · ${assignment.grade_band}`}>
            <p className="prose">{assignment.teaching_intent}</p>
          </Section>
          <Section title="Source text">
            <pre className="json">{assignment.source_text}</pre>
          </Section>
        </>
      );
    }

    case "central_table": {
      if (projection.concepts.length === 0) {
        return (
          <EmptyState
            title="No concepts extracted yet"
            body="The Assignment Architect emits assignment.concepts.extracted once it has read the upload."
          />
        );
      }
      return (
        <>
          {projection.concepts.map((concept) => (
            <Section
              key={concept.concept_id}
              title={concept.label}
              subtitle={concept.description}
            >
              <KeyValue label="Appears in">
                <LabelList values={concept.problem_refs ?? []} />
              </KeyValue>
              <KeyValue label="Prerequisite of">
                <LabelList values={concept.prerequisite_of ?? []} />
              </KeyValue>
            </Section>
          ))}
        </>
      );
    }

    case "memory_library": {
      if (projection.students.length === 0) {
        return (
          <EmptyState
            title="Memory is idle"
            body="Student histories load with student.context.ready."
          />
        );
      }
      return (
        <Section
          title={`${projection.students.length} student records`}
          subtitle="Retrieved from prior work, not from labels."
        >
          <div className="member-grid">
            {projection.students.map((student) => {
              const scores = Object.values(student.mastery ?? {}).map((m) => m.score);
              const average =
                scores.length > 0
                  ? scores.reduce((sum, value) => sum + value, 0) / scores.length
                  : 0;
              return (
                <button
                  key={student.student_id}
                  type="button"
                  className="member"
                  onClick={() =>
                    onSelect({ kind: "student", studentId: student.student_id })
                  }
                >
                  <span className="member__name">{student.display_name}</span>
                  <span className="member__meta">
                    mean mastery {Math.round(average * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      );
    }

    case "agent_workshop": {
      const lastByAgent = new Map<string, string>();
      for (const event of projection.events) {
        lastByAgent.set(event.source_agent, event.event_type);
      }
      return (
        <Section
          title="Typed agent mesh"
          subtitle="Every agent emits a structured, validated result. The world only animates what the bus reports."
        >
          <ul className="agent-list">
            {agentNames.map((agent) => {
              const last = lastByAgent.get(agent);
              return (
                <li key={agent} className="agent-list__item">
                  <span className="agent-list__name">{humanize(agent)}</span>
                  {last ? (
                    <Chip tone="good">{last}</Chip>
                  ) : (
                    <Chip>idle</Chip>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      );
    }

    case "assessment_forge": {
      if (projection.assessments.length === 0) {
        return (
          <EmptyState
            title="Nothing graded yet"
            body="Run the classroom simulation to send submissions to the forge."
          />
        );
      }
      const flagged = projection.assessments.filter((a) => a.human_review_required);
      const mean =
        projection.assessments.reduce((sum, a) => sum + a.score, 0) /
        projection.assessments.length;
      return (
        <>
          <Section title="Batch summary">
            <Meter label="Mean score" value={mean} />
            <KeyValue label="Flagged for review">
              {flagged.length > 0 ? (
                <Chip tone="bad">{flagged.length} low-confidence grade(s)</Chip>
              ) : (
                <Chip tone="good">None</Chip>
              )}
            </KeyValue>
          </Section>
          <Section title="Graded submissions" subtitle="Click a student to see the narrative.">
            <div className="member-grid">
              {projection.assessments.map((assessment) => (
                <button
                  key={assessment.assessment_id}
                  type="button"
                  className={`member${assessment.human_review_required ? " member--flagged" : ""}`}
                  onClick={() =>
                    onSelect({ kind: "student", studentId: assessment.student_id })
                  }
                >
                  <span className="member__name">
                    {projection.students.find(
                      (s) => s.student_id === assessment.student_id,
                    )?.display_name ?? assessment.student_id}
                  </span>
                  <span className="member__meta">
                    {Math.round(assessment.score * 100)}% · confidence{" "}
                    {Math.round(assessment.confidence * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </Section>
        </>
      );
    }

    case "planning_observatory": {
      if (!projection.lessonPlan) {
        return (
          <EmptyState
            title="No plan yet"
            body="The Lesson Planner emits lesson.plan.ready after mastery updates."
          />
        );
      }
      return <LessonPlanOverview projection={projection} onSelect={onSelect} />;
    }

    case "communication_beacon": {
      if (projection.reviewQueue.length === 0) {
        return (
          <EmptyState
            title="No approvals pending"
            body="Low-confidence agent output is routed here instead of being applied silently."
          />
        );
      }
      return (
        <>
          {projection.reviewQueue.map((item) => {
            const confidence = reviewConfidence(item);
            const canApprove = item.status === "open" || item.status === "pending";
            return (
              <Section
                key={item.review_id}
                title={humanize(item.agent)}
                subtitle={
                  confidence === null
                    ? humanize(item.review_type)
                    : `Confidence ${Math.round(confidence * 100)}%`
                }
                actions={
                  canApprove ? (
                    <button
                      type="button"
                      className="chip-button chip-button--tiny"
                      onClick={() => onApprove(item.review_id)}
                    >
                      Approve
                    </button>
                  ) : (
                    <Chip tone="good">{humanize(item.status)}</Chip>
                  )
                }
              >
                <p className="prose">{item.reason}</p>
                <KeyValue label="Evidence">
                  <EvidenceList refs={item.evidence_refs ?? []} />
                </KeyValue>
              </Section>
            );
          })}
        </>
      );
    }

    default:
      return (
        <EmptyState
          title="Nothing to inspect"
          body="This structure is part of the campus but does not hold run data."
        />
      );
  }
}
