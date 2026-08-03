/**
 * Lesson Planner — Person C owned.
 *
 * Consumes `student.models.updated`, publishes `lesson.plan.ready` (events are
 * emitted by the orchestrator in src/server/submissions).
 *
 * Builds tomorrow's timeline from the evolution output: the largest remaining
 * class-wide gap opens as a whole-class mini-lesson, then room rotations run
 * against each room's refreshed barrier. Every step cites evidence.
 */
import { z } from "zod";
import type { AgentResult, ConceptId, LessonPlan, RoomId, RunState } from "@/contracts";
import { conceptIds, roomIds } from "@/contracts";
import type { EvolutionOutput } from "./classroomEvolution";

const conceptLabels: Record<ConceptId, string> = {
  integer_operations: "integer operations",
  distributive_property: "distribution",
  equation_sequencing: "equation sequencing",
  combining_like_terms: "combining like terms",
};

const wholeClassLessons: Record<ConceptId, string> = {
  integer_operations:
    "Whole-class integer mini-lesson: sign-tracking on a shared number line before independent work.",
  distributive_property:
    "Whole-class distribution mini-lesson: box/area model showing that a(b + c) reaches every term, verified by substitution.",
  equation_sequencing:
    "Whole-class sequencing mini-lesson: plan the undo-order before touching the equation.",
  combining_like_terms:
    "Whole-class like-terms mini-lesson: sort terms by variable part before combining.",
};

const lessonPlanSchema = z.object({
  run_id: z.string().min(1),
  timeline: z
    .array(
      z.object({
        step_id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        audience: z.union([z.literal("whole_class"), z.enum(roomIds)]),
        duration_minutes: z.number().int().positive(),
        evidence_refs: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
  whole_class_intervention: z.string().min(1),
  room_rotations: z.record(z.enum(roomIds), z.string().min(1)),
  evidence_refs: z.array(z.string().min(1)).min(1),
  approval_state: z.enum(["pending", "approved", "rejected"]),
});

function masteryEvidence(evolution: EvolutionOutput, conceptId: ConceptId): string[] {
  const refs = evolution.mastery_deltas
    .filter((delta) => delta.concept_id === conceptId)
    .map((delta) => `mastery:${delta.student_id}:${delta.concept_id}`);
  return refs.length > 0 ? refs : [`concept:${conceptId}`];
}

function roomEvidence(run: RunState, roomId: RoomId): string[] {
  const room = run.rooms.find((candidate) => candidate.room_id === roomId);
  const memberRefs = (room?.members ?? []).map((studentId) => `assessment:${studentId}`);
  return memberRefs.length > 0 ? memberRefs : [`room:${roomId}`];
}

export function runLessonPlanner(
  run: RunState,
  evolution: EvolutionOutput,
): AgentResult<LessonPlan> {
  const gapConcept = evolution.largest_gap_concept;
  const gapAverage = evolution.class_concept_averages[gapConcept];
  const wholeClassIntervention = wholeClassLessons[gapConcept];

  const roomRotations: Record<RoomId, string> = {
    ember:
      "Ember quick check: four integer-sign problems to confirm this week's gains hold without scaffolds.",
    forge:
      "Forge targeted box-model practice: distribute across every term, then re-solve yesterday's missed problems.",
    harbor:
      "Harbor sequencing transfer task: plan the undo-order first, then solve an unfamiliar multi-step equation.",
    summit:
      "Summit extension justification: solve extension equations and defend each step of the path in writing.",
  };

  const timeline: LessonPlan["timeline"] = [
    {
      step_id: "step-1",
      title: `Whole-class ${conceptLabels[gapConcept]} mini-lesson`,
      description: `${wholeClassIntervention} Largest remaining class gap: ${conceptLabels[gapConcept]} (class average ${gapAverage}).`,
      audience: "whole_class",
      duration_minutes: 10,
      evidence_refs: masteryEvidence(evolution, gapConcept),
    },
    {
      step_id: "step-2",
      title: "Room rotations",
      description:
        "Students rotate into refreshed rooms reflecting each learner's current barrier after today's submissions.",
      audience: "whole_class",
      duration_minutes: 5,
      evidence_refs:
        evolution.room_changes.length > 0
          ? evolution.room_changes.map((change) => `assessment:${change.student_id}`)
          : ["rooms:unchanged"],
    },
    {
      step_id: "step-3",
      title: "Ember quick check",
      description: roomRotations.ember,
      audience: "ember",
      duration_minutes: 10,
      evidence_refs: roomEvidence(run, "ember"),
    },
    {
      step_id: "step-4",
      title: "Forge targeted box-model practice",
      description: roomRotations.forge,
      audience: "forge",
      duration_minutes: 15,
      evidence_refs: roomEvidence(run, "forge"),
    },
    {
      step_id: "step-5",
      title: "Harbor sequencing transfer task",
      description: roomRotations.harbor,
      audience: "harbor",
      duration_minutes: 15,
      evidence_refs: roomEvidence(run, "harbor"),
    },
    {
      step_id: "step-6",
      title: "Summit extension justification",
      description: roomRotations.summit,
      audience: "summit",
      duration_minutes: 15,
      evidence_refs: roomEvidence(run, "summit"),
    },
  ];

  const evidenceRefs = [
    ...new Set([
      ...conceptIds.map((conceptId) => `class_average:${conceptId}:${evolution.class_concept_averages[conceptId]}`),
      ...evolution.room_changes.map((change) => `assessment:${change.student_id}`),
    ]),
  ];

  const plan = lessonPlanSchema.parse({
    run_id: run.run_id,
    timeline,
    whole_class_intervention: wholeClassIntervention,
    room_rotations: roomRotations,
    evidence_refs: evidenceRefs,
    approval_state: "pending",
  }) as LessonPlan;

  return {
    run_id: run.run_id,
    agent: "lesson_planner",
    status: "completed",
    confidence: 0.86,
    evidence_refs: evidenceRefs,
    result: plan,
    human_review_required: true,
  };
}
