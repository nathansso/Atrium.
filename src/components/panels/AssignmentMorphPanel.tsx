"use client";

import { useMemo, useState } from "react";
import { roomIds, type RoomId } from "@/contracts";
import { ROOM_COLOR } from "@/world/layout";
import { humanize } from "@/world/payloads";
import { membersOfRoom, variantForRoom, type RunProjection } from "@/world/runState";
import { Chip, EmptyState, LabelList } from "./atoms";

type MorphMode = "original" | "room" | "student";
type ProblemView = {
  problem_id: string;
  prompt: string;
  concepts?: string[];
};
type StudentLayerView = {
  student_id: string;
  supports_applied?: string[];
  delivery_notes?: string;
  problems?: ProblemView[];
};
type ProblemContainerView = {
  problems?: unknown;
  questions?: unknown;
  items?: unknown;
  title?: string;
  subject?: string;
  course?: string;
  grade_band?: string;
  teaching_intent?: string;
  objective_statement?: string;
  adaptation_summary?: string;
  rationale?: string;
};

const MODE_LABEL: Record<MorphMode, string> = {
  original: "Original",
  room: "Room Version",
  student: "Student Layer",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readProblems(source: ProblemContainerView | null | undefined): ProblemView[] {
  if (!source) return [];
  const entries = Array.isArray(source.problems)
    ? source.problems
    : Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.items)
        ? source.items
        : [];

  return entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const prompt = readString(entry.prompt);
    if (!prompt) return [];
    return [
      {
        problem_id:
          readString(entry.problem_id) ??
          readString(entry.question_id) ??
          readString(entry.item_id) ??
          `problem_${index + 1}`,
        prompt,
        concepts: readStringArray(entry.concepts),
      },
    ];
  });
}

export function AssignmentMorphPanel({ projection }: { projection: RunProjection }) {
  const [mode, setMode] = useState<MorphMode>("original");
  const [roomId, setRoomId] = useState<RoomId>("ember");
  const [studentId, setStudentId] = useState<string | null>(null);

  const variant = variantForRoom(projection, roomId);
  const members = useMemo(
    () => membersOfRoom(projection, roomId),
    [projection, roomId],
  );

  const selectedStudentId =
    studentId && members.some((member) => member.student_id === studentId)
      ? studentId
      : (members[0]?.student_id ?? null);

  const layer = variant?.student_layers?.find(
    (entry: StudentLayerView) => entry.student_id === selectedStudentId,
  ) as StudentLayerView | undefined;

  const assignment = projection.assignment;
  const assignmentView = assignment as ProblemContainerView | null;
  const assignmentProblems = readProblems(assignmentView);
  const variantView = variant as ProblemContainerView | undefined;
  const variantProblems = readProblems(variantView);
  const layerProblems = readProblems(layer);

  return (
    <div className="morph">
      <div className="morph__head">
        <h3 className="section__title">Assignment morph</h3>
        {variant && (
          <Chip tone={variant.objective_preserved ? "good" : "bad"}>
            {variant.objective_preserved
              ? "Objective preserved"
              : "Objective changed"}
          </Chip>
        )}
      </div>

      <div className="segmented" role="tablist" aria-label="Assignment view">
        {(Object.keys(MODE_LABEL) as MorphMode[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className={`segmented__option${mode === value ? " segmented__option--active" : ""}`}
            onClick={() => setMode(value)}
          >
            {MODE_LABEL[value]}
          </button>
        ))}
      </div>

      {mode !== "original" && (
        <div className="morph__selectors">
          <div className="morph__rooms">
            {roomIds.map((id) => (
              <button
                key={id}
                type="button"
                className={`room-tab${roomId === id ? " room-tab--active" : ""}`}
                style={roomId === id ? { borderColor: ROOM_COLOR[id] } : undefined}
                onClick={() => setRoomId(id)}
              >
                <span
                  className="room-tab__dot"
                  style={{ background: ROOM_COLOR[id] }}
                  aria-hidden="true"
                />
                {humanize(id)}
              </button>
            ))}
          </div>
          {mode === "student" && (
            <label className="morph__student">
              <span>Student</span>
              <select
                value={selectedStudentId ?? ""}
                onChange={(event) => setStudentId(event.target.value)}
              >
                {members.length === 0 && <option value="">No students yet</option>}
                {members.map((member) => (
                  <option key={member.student_id} value={member.student_id}>
                    {member.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="morph__body">
        {mode === "original" &&
          (assignmentView ? (
            <>
              <p className="morph__meta">
                {assignmentView.title} · {assignmentView.subject ?? assignmentView.course} ·{" "}
                {assignmentView.grade_band ?? "Demo cohort"}
              </p>
              <p className="morph__intent">
                <strong>Teaching intent:</strong> {assignmentView.teaching_intent}
              </p>
              <ol className="problem-list">
                {assignmentProblems.map((problem) => (
                  <li key={problem.problem_id}>
                    <span className="problem__prompt">{problem.prompt}</span>
                    <LabelList values={problem.concepts ?? []} />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <EmptyState
              title="No assignment yet"
              body="Upload an assignment and start a run. The original text appears here, and the room and student views morph from it."
            />
          ))}

        {mode === "room" &&
          (variant ? (
            <>
              <p className="morph__meta">{variantView?.title}</p>
              <p className="morph__intent">
                <strong>Objective:</strong> {variantView?.objective_statement}
              </p>
              <p className="prose">{variantView?.adaptation_summary ?? variantView?.rationale}</p>
              <p className="prose muted">{variantView?.rationale}</p>
              <ol className="problem-list">
                {variantProblems.map((problem) => (
                  <li key={problem.problem_id}>
                    <span className="problem__prompt">{problem.prompt}</span>
                    <LabelList values={problem.concepts ?? []} />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <EmptyState
              title={`No ${humanize(roomId)} variant yet`}
              body="Room versions appear with the assignment.variants.ready event."
            />
          ))}

        {mode === "student" &&
          (layer ? (
            <>
              <p className="morph__meta">
                {members.find((m) => m.student_id === selectedStudentId)?.display_name} ·{" "}
                {humanize(roomId)} version
              </p>
              <p className="morph__intent">
                <strong>Supports applied:</strong>
              </p>
              <LabelList values={layer.supports_applied ?? []} />
              <p className="prose">{layer.delivery_notes}</p>
              <p className="prose muted">
                The mathematics is identical to the {humanize(roomId)} version above.
                Only delivery changes at this layer.
              </p>
              {layerProblems.length > 0 && (
                <ol className="problem-list">
                  {layerProblems.map((problem) => (
                    <li key={problem.problem_id}>
                      <span className="problem__prompt">{problem.prompt}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <EmptyState
              title="No student layer yet"
              body="Accessibility layers attach after the accessibility.layers.ready event."
            />
          ))}
      </div>
    </div>
  );
}
