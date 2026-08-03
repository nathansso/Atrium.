import type {
  Assignment,
  AssessmentResult,
  AssignmentVariant,
  ConceptId,
  ConceptSummary,
  LessonPlan,
  MasteryEstimate,
  MisconceptionId,
  ReviewItem,
  Room,
  RoomId,
  Student,
  SupportId,
} from "@/contracts";

/**
 * Frontend demo fixture.
 *
 * This is Person A's local replay data, not the backend seed (`src/seed`, owned
 * by Person B). It exists so the world can be demoed with no backend running,
 * and it deliberately uses the same contract types so swapping to live SSE is a
 * transport change only.
 */

export const MOCK_RUN_ID = "run_atrium_demo";

export const mockAssignment = {
  assignment_id: "asg_algebra1_multistep",
  title: "Multi-Step Equations Practice Set",
  subject: "Algebra I",
  grade_band: "Grade 8-9",
  teaching_intent:
    "Students should solve multi-step linear equations and be able to justify each step, not just reach the answer.",
  source_text: [
    "Solve each equation. Show every step.",
    "1. 3(x - 4) = 18",
    "2. -2(x + 5) = 14",
    "3. 5x - 3 = 2x + 12",
    "4. 4(2x - 1) - 3x = 21",
    "5. -(x - 7) = 2x + 1",
    "6. 6x + 2 - 4x = 3(x - 5)",
    "7. 2(3x + 4) = 4(x + 6)",
    "8. Explain why you can add the same value to both sides of an equation.",
  ].join("\n"),
  problems: [
    { problem_id: "p1", prompt: "3(x - 4) = 18", concepts: ["distributive_property", "equation_sequencing"] },
    { problem_id: "p2", prompt: "-2(x + 5) = 14", concepts: ["integer_operations", "distributive_property"] },
    { problem_id: "p3", prompt: "5x - 3 = 2x + 12", concepts: ["combining_like_terms", "equation_sequencing"] },
    { problem_id: "p4", prompt: "4(2x - 1) - 3x = 21", concepts: ["distributive_property", "combining_like_terms"] },
    { problem_id: "p5", prompt: "-(x - 7) = 2x + 1", concepts: ["integer_operations", "distributive_property"] },
    { problem_id: "p6", prompt: "6x + 2 - 4x = 3(x - 5)", concepts: ["combining_like_terms", "equation_sequencing"] },
    { problem_id: "p7", prompt: "2(3x + 4) = 4(x + 6)", concepts: ["distributive_property", "equation_sequencing"] },
    {
      problem_id: "p8",
      prompt: "Explain why you can add the same value to both sides of an equation.",
      concepts: ["equation_sequencing"],
    },
  ],
} as unknown as Assignment;

export const mockConcepts = [
  {
    concept_id: "integer_operations",
    label: "Integer Operations",
    description: "Signed arithmetic, especially negatives entering a product.",
    problem_refs: ["p2", "p5"],
    prerequisite_of: ["distributive_property"],
  },
  {
    concept_id: "distributive_property",
    label: "Distributive Property",
    description: "Multiplying a factor across every term inside a grouping.",
    problem_refs: ["p1", "p2", "p4", "p5", "p7"],
    prerequisite_of: ["equation_sequencing"],
  },
  {
    concept_id: "combining_like_terms",
    label: "Combining Like Terms",
    description: "Collecting terms of matching degree before isolating.",
    problem_refs: ["p3", "p4", "p6"],
    prerequisite_of: ["equation_sequencing"],
  },
  {
    concept_id: "equation_sequencing",
    label: "Equation Sequencing",
    description: "Choosing and ordering inverse operations across several steps.",
    problem_refs: ["p1", "p3", "p6", "p7", "p8"],
    prerequisite_of: [],
  },
] as unknown as ConceptSummary[];

function mastery(
  score: number,
  confidence: number,
  trend: MasteryEstimate["trend"],
): MasteryEstimate {
  return { score, confidence, trend };
}

type SeedStudent = {
  id: string;
  name: string;
  room: RoomId;
  supports: SupportId[];
  scaffolding: 1 | 2 | 3 | 4;
  patterns: MisconceptionId[];
  scores: [number, number, number, number];
};

/** Order matches ConceptId order below. */
const CONCEPT_ORDER: ConceptId[] = [
  "integer_operations",
  "distributive_property",
  "combining_like_terms",
  "equation_sequencing",
];

const seedStudents: SeedStudent[] = [
  {
    id: "stu_amara",
    name: "Amara O.",
    room: "ember",
    supports: ["chunked_steps", "visual_model"],
    scaffolding: 3,
    patterns: ["sign_drop_on_distribution"],
    scores: [0.41, 0.38, 0.62, 0.44],
  },
  {
    id: "stu_diego",
    name: "Diego R.",
    room: "ember",
    supports: ["manipulatives"],
    scaffolding: 3,
    patterns: ["sign_drop_on_distribution", "distributes_only_first_term"],
    scores: [0.36, 0.34, 0.58, 0.4],
  },
  {
    id: "stu_lena",
    name: "Lena K.",
    room: "ember",
    supports: ["extended_time", "chunked_steps"],
    scaffolding: 2,
    patterns: ["distributes_only_first_term"],
    scores: [0.52, 0.4, 0.6, 0.47],
  },
  {
    id: "stu_micah",
    name: "Micah T.",
    room: "forge",
    supports: ["chunked_steps"],
    scaffolding: 3,
    patterns: ["reverses_inverse_operation", "loses_track_of_multi_step_order"],
    scores: [0.66, 0.61, 0.55, 0.33],
  },
  {
    id: "stu_priya",
    name: "Priya S.",
    room: "forge",
    supports: ["extended_time"],
    scaffolding: 2,
    patterns: ["loses_track_of_multi_step_order"],
    scores: [0.7, 0.64, 0.59, 0.38],
  },
  {
    id: "stu_jonah",
    name: "Jonah B.",
    room: "forge",
    supports: ["read_aloud", "reduced_language_load"],
    scaffolding: 3,
    patterns: ["reverses_inverse_operation"],
    scores: [0.63, 0.6, 0.52, 0.35],
  },
  {
    id: "stu_yusuf",
    name: "Yusuf A.",
    room: "harbor",
    supports: ["visual_model"],
    scaffolding: 2,
    patterns: ["combines_unlike_terms"],
    scores: [0.72, 0.68, 0.36, 0.58],
  },
  {
    id: "stu_nina",
    name: "Nina C.",
    room: "harbor",
    supports: ["reduced_language_load"],
    scaffolding: 2,
    patterns: ["combines_unlike_terms"],
    scores: [0.69, 0.71, 0.33, 0.61],
  },
  {
    id: "stu_theo",
    name: "Theo M.",
    room: "harbor",
    supports: ["extended_time", "visual_model"],
    scaffolding: 2,
    patterns: ["combines_unlike_terms", "loses_track_of_multi_step_order"],
    scores: [0.66, 0.66, 0.39, 0.54],
  },
  {
    id: "stu_ivy",
    name: "Ivy L.",
    room: "summit",
    supports: [],
    scaffolding: 1,
    patterns: [],
    scores: [0.88, 0.86, 0.84, 0.79],
  },
  {
    id: "stu_ravi",
    name: "Ravi N.",
    room: "summit",
    supports: [],
    scaffolding: 1,
    patterns: [],
    scores: [0.91, 0.87, 0.82, 0.83],
  },
  {
    id: "stu_hana",
    name: "Hana W.",
    room: "summit",
    supports: ["extended_time"],
    scaffolding: 1,
    patterns: [],
    scores: [0.85, 0.83, 0.86, 0.76],
  },
];

function trendFor(score: number): MasteryEstimate["trend"] {
  if (score >= 0.75) return "rising";
  if (score <= 0.4) return "falling";
  return "flat";
}

export const mockStudents: Student[] = seedStudents.map((seed, index) => {
  const masteryMap = {} as Record<ConceptId, MasteryEstimate>;
  CONCEPT_ORDER.forEach((conceptId, conceptIndex) => {
    const score = seed.scores[conceptIndex];
    masteryMap[conceptId] = mastery(score, 0.62 + (index % 4) * 0.07, trendFor(score));
  });
  return {
    student_id: seed.id,
    display_name: seed.name,
    avatar_key: `student_${index % 8}`,
    supports: seed.supports,
    mastery: masteryMap,
    recent_patterns: seed.patterns,
    scaffolding_level: seed.scaffolding,
  };
});

function membersOf(roomId: RoomId): string[] {
  return seedStudents.filter((seed) => seed.room === roomId).map((seed) => seed.id);
}

export const mockRooms: Room[] = [
  {
    room_id: "ember",
    name: "Ember",
    focus_concepts: ["integer_operations", "distributive_property"],
    dominant_barrier:
      "Sign is dropped when a negative factor is distributed across a grouping.",
    evidence_refs: [
      "ev:submission:stu_amara:2026-05-12#p2",
      "ev:submission:stu_diego:2026-05-12#p5",
      "ev:pattern:sign_drop_on_distribution",
    ],
    members: membersOf("ember"),
    base_adaptation:
      "Distribution is shown as an explicit two-factor expansion before any solving begins.",
    explanation:
      "These three students each solve correctly once the expression is expanded for them. The barrier is the sign of the factor entering the parentheses, not the equation itself.",
  },
  {
    room_id: "forge",
    name: "Forge",
    focus_concepts: ["equation_sequencing"],
    dominant_barrier:
      "Inverse operations are applied in the wrong order across multi-step problems.",
    evidence_refs: [
      "ev:submission:stu_micah:2026-05-12#p6",
      "ev:submission:stu_priya:2026-05-10#p3",
      "ev:pattern:loses_track_of_multi_step_order",
    ],
    members: membersOf("forge"),
    base_adaptation:
      "Each problem carries a step ledger so the chosen operation is recorded before it is executed.",
    explanation:
      "Arithmetic is reliable here. The breakdown appears once more than two steps are in play and the order of undoing is the decision being made.",
  },
  {
    room_id: "harbor",
    name: "Harbor",
    focus_concepts: ["combining_like_terms"],
    dominant_barrier:
      "Unlike terms are collected together once an expression grows past three terms.",
    evidence_refs: [
      "ev:submission:stu_yusuf:2026-05-12#p4",
      "ev:submission:stu_nina:2026-05-12#p6",
      "ev:pattern:combines_unlike_terms",
    ],
    members: membersOf("harbor"),
    base_adaptation:
      "Terms are color-banded by degree so grouping is a sorting decision before it is an arithmetic one.",
    explanation:
      "These students distribute correctly and sequence correctly. The error enters at the collection step when the expression is long.",
  },
  {
    room_id: "summit",
    name: "Summit",
    focus_concepts: ["equation_sequencing", "distributive_property"],
    dominant_barrier:
      "Procedure is fluent but justification and generalization are still absent.",
    evidence_refs: [
      "ev:submission:stu_ivy:2026-05-12#p8",
      "ev:submission:stu_ravi:2026-05-12#p7",
      "ev:pattern:none",
    ],
    members: membersOf("summit"),
    base_adaptation:
      "Problems are posed in reverse: given a solution path, decide whether it is valid and say why.",
    explanation:
      "All three reach correct answers quickly. The growth edge is explaining why a step is legal, which is exactly what problem 8 asks for.",
  },
];

const OBJECTIVE =
  "Solve multi-step linear equations and justify each step.";

export const mockVariants = [
  {
    variant_id: "var_ember",
    room_id: "ember",
    title: "Multi-Step Equations — Ember Path",
    objective_preserved: true,
    objective_statement: OBJECTIVE,
    adaptation_summary:
      "Distribution is pre-expanded into an explicit product line; sign of the factor is called out before expansion.",
    rationale:
      "Ember's barrier is sign handling at the distribution step, so the expansion is surfaced rather than removed. The equations solved are the same difficulty.",
    problems: [
      { problem_id: "e1", prompt: "3(x - 4) = 18  →  first write 3·x + 3·(-4)", concepts: ["distributive_property"] },
      { problem_id: "e2", prompt: "-2(x + 5) = 14  →  the factor is -2. Write -2·x + -2·5", concepts: ["integer_operations", "distributive_property"] },
      { problem_id: "e3", prompt: "-(x - 7) = 2x + 1  →  the leading factor is -1", concepts: ["integer_operations", "distributive_property"] },
      { problem_id: "e4", prompt: "4(2x - 1) - 3x = 21  →  expand first, then collect", concepts: ["distributive_property", "combining_like_terms"] },
    ],
    student_layers: [
      {
        student_id: "stu_amara",
        supports_applied: ["chunked_steps", "visual_model"],
        delivery_notes:
          "One problem per screen with an area-model diagram beside the expansion line.",
        problems: [],
      },
      {
        student_id: "stu_diego",
        supports_applied: ["manipulatives"],
        delivery_notes:
          "Algebra tiles available for the first two problems; tiles are removed for the last two.",
        problems: [],
      },
      {
        student_id: "stu_lena",
        supports_applied: ["extended_time", "chunked_steps"],
        delivery_notes: "No time cap; problems revealed two at a time.",
        problems: [],
      },
    ],
  },
  {
    variant_id: "var_forge",
    room_id: "forge",
    title: "Multi-Step Equations — Forge Path",
    objective_preserved: true,
    objective_statement: OBJECTIVE,
    adaptation_summary:
      "Every problem carries a step ledger: name the operation, then apply it, then check.",
    rationale:
      "Forge loses ordering, not arithmetic. Making the choice of inverse operation explicit turns an invisible decision into a recorded one.",
    problems: [
      { problem_id: "f1", prompt: "5x - 3 = 2x + 12   [ledger: step 1 operation? step 2 operation?]", concepts: ["equation_sequencing", "combining_like_terms"] },
      { problem_id: "f2", prompt: "6x + 2 - 4x = 3(x - 5)   [ledger required]", concepts: ["equation_sequencing"] },
      { problem_id: "f3", prompt: "2(3x + 4) = 4(x + 6)   [ledger required]", concepts: ["equation_sequencing", "distributive_property"] },
      { problem_id: "f4", prompt: "Order these four steps into a valid solution path.", concepts: ["equation_sequencing"] },
    ],
    student_layers: [
      {
        student_id: "stu_micah",
        supports_applied: ["chunked_steps"],
        delivery_notes: "Ledger rows appear one at a time as the previous row is filled.",
        problems: [],
      },
      {
        student_id: "stu_priya",
        supports_applied: ["extended_time"],
        delivery_notes: "No time cap.",
        problems: [],
      },
      {
        student_id: "stu_jonah",
        supports_applied: ["read_aloud", "reduced_language_load"],
        delivery_notes:
          "Prompts read aloud on demand; instruction text shortened to one clause per line. Mathematics is unchanged.",
        problems: [],
      },
    ],
  },
  {
    variant_id: "var_harbor",
    room_id: "harbor",
    title: "Multi-Step Equations — Harbor Path",
    objective_preserved: true,
    objective_statement: OBJECTIVE,
    adaptation_summary:
      "Terms are color-banded by degree, and a sorting step precedes each solve.",
    rationale:
      "Harbor collects unlike terms once expressions get long. Sorting before solving isolates the step that actually fails.",
    problems: [
      { problem_id: "h1", prompt: "Sort then solve: 4(2x - 1) - 3x = 21", concepts: ["combining_like_terms"] },
      { problem_id: "h2", prompt: "Sort then solve: 6x + 2 - 4x = 3(x - 5)", concepts: ["combining_like_terms", "equation_sequencing"] },
      { problem_id: "h3", prompt: "Which of these terms can be combined? 7x, 4, -2x, 3x²", concepts: ["combining_like_terms"] },
      { problem_id: "h4", prompt: "Solve: 5x - 3 = 2x + 12", concepts: ["combining_like_terms", "equation_sequencing"] },
    ],
    student_layers: [
      {
        student_id: "stu_yusuf",
        supports_applied: ["visual_model"],
        delivery_notes: "Degree bands rendered as labeled swatches beside each term.",
        problems: [],
      },
      {
        student_id: "stu_nina",
        supports_applied: ["reduced_language_load"],
        delivery_notes: "Directions compressed to a single imperative line.",
        problems: [],
      },
      {
        student_id: "stu_theo",
        supports_applied: ["extended_time", "visual_model"],
        delivery_notes: "No time cap; bands persist through the solve.",
        problems: [],
      },
    ],
  },
  {
    variant_id: "var_summit",
    room_id: "summit",
    title: "Multi-Step Equations — Summit Path",
    objective_preserved: true,
    objective_statement: OBJECTIVE,
    adaptation_summary:
      "Problems are inverted: judge a worked solution and justify the verdict.",
    rationale:
      "Summit already solves fluently. The unmet part of the objective is justification, so the task asks for exactly that.",
    problems: [
      { problem_id: "s1", prompt: "This solution to 2(3x + 4) = 4(x + 6) has one illegal step. Find it and say why it is illegal.", concepts: ["equation_sequencing"] },
      { problem_id: "s2", prompt: "Construct an equation whose solution is x = -3 and that needs at least three steps.", concepts: ["equation_sequencing", "distributive_property"] },
      { problem_id: "s3", prompt: "Explain why adding the same value to both sides preserves the solution set.", concepts: ["equation_sequencing"] },
      { problem_id: "s4", prompt: "For which values of a does a(x - 4) = 18 have an integer solution?", concepts: ["distributive_property"] },
    ],
    student_layers: [
      {
        student_id: "stu_ivy",
        supports_applied: [],
        delivery_notes: "Standard delivery.",
        problems: [],
      },
      {
        student_id: "stu_ravi",
        supports_applied: [],
        delivery_notes: "Standard delivery.",
        problems: [],
      },
      {
        student_id: "stu_hana",
        supports_applied: ["extended_time"],
        delivery_notes: "No time cap on the written justification.",
        problems: [],
      },
    ],
  },
] as unknown as AssignmentVariant[];

type SeedAssessment = {
  studentId: string;
  score: number;
  confidence: number;
  misconceptions: MisconceptionId[];
  narrative: string;
};

const seedAssessments: SeedAssessment[] = [
  {
    studentId: "stu_amara",
    score: 0.68,
    confidence: 0.84,
    misconceptions: ["sign_drop_on_distribution"],
    narrative: "Expansion is now written out, and the sign survives on 3 of 4 problems.",
  },
  {
    studentId: "stu_diego",
    score: 0.55,
    confidence: 0.41,
    misconceptions: ["sign_drop_on_distribution", "distributes_only_first_term"],
    narrative:
      "Work is partially unreadable after step two; the visible steps are correct but the final line does not follow. Low confidence — needs a human read.",
  },
  {
    studentId: "stu_lena",
    score: 0.74,
    confidence: 0.88,
    misconceptions: [],
    narrative: "Distribution is clean across all four problems, including the -1 factor.",
  },
  {
    studentId: "stu_micah",
    score: 0.61,
    confidence: 0.79,
    misconceptions: ["loses_track_of_multi_step_order"],
    narrative: "Ledger is filled correctly for two problems, then abandoned on the third.",
  },
  {
    studentId: "stu_priya",
    score: 0.77,
    confidence: 0.86,
    misconceptions: [],
    narrative: "Ordering is correct throughout once each step was named before execution.",
  },
  {
    studentId: "stu_jonah",
    score: 0.64,
    confidence: 0.81,
    misconceptions: ["reverses_inverse_operation"],
    narrative: "Divides before subtracting on problem 2; the rest of the path is sound.",
  },
  {
    studentId: "stu_yusuf",
    score: 0.72,
    confidence: 0.85,
    misconceptions: [],
    narrative: "Sorting step held; unlike terms stayed separate through both long problems.",
  },
  {
    studentId: "stu_nina",
    score: 0.58,
    confidence: 0.78,
    misconceptions: ["combines_unlike_terms"],
    narrative: "Combined 7x with 4 on the sorting item, then solved the rest correctly.",
  },
  {
    studentId: "stu_theo",
    score: 0.66,
    confidence: 0.8,
    misconceptions: ["combines_unlike_terms"],
    narrative: "Bands helped on the first problem; the error returns when bands are removed.",
  },
  {
    studentId: "stu_ivy",
    score: 0.92,
    confidence: 0.9,
    misconceptions: [],
    narrative: "Found the illegal step and named the property that was violated.",
  },
  {
    studentId: "stu_ravi",
    score: 0.89,
    confidence: 0.9,
    misconceptions: [],
    narrative: "Constructed a valid three-step equation and justified the construction.",
  },
  {
    studentId: "stu_hana",
    score: 0.81,
    confidence: 0.87,
    misconceptions: [],
    narrative: "Justification is correct but stated informally; the reasoning holds.",
  },
];

function roomOf(studentId: string): RoomId {
  return seedStudents.find((seed) => seed.id === studentId)?.room ?? "ember";
}

export const mockAssessments = seedAssessments.map((seed, index) => ({
  assessment_id: `asm_${index + 1}`,
  student_id: seed.studentId,
  room_id: roomOf(seed.studentId),
  score: seed.score,
  confidence: seed.confidence,
  misconceptions: seed.misconceptions,
  evidence_refs: [
    `ev:submission:${seed.studentId}:2026-05-13`,
    `ev:variant:${roomOf(seed.studentId)}`,
  ],
  human_review_required: seed.confidence < 0.6,
  narrative: seed.narrative,
})) as unknown as AssessmentResult[];

/** Regrouping after assessment: two students move, the rest hold. */
export const mockMoves: Array<{ student_id: string; from_room: RoomId; to_room: RoomId }> = [
  { student_id: "stu_lena", from_room: "ember", to_room: "harbor" },
  { student_id: "stu_priya", from_room: "forge", to_room: "summit" },
  { student_id: "stu_nina", from_room: "harbor", to_room: "forge" },
];

/** Student models after `student.models.updated`, including new room placement. */
export const mockUpdatedStudents: Student[] = mockStudents.map((student) => {
  const move = mockMoves.find((entry) => entry.student_id === student.student_id);
  const assessment = mockAssessments.find(
    (entry) => entry.student_id === student.student_id,
  );
  const delta = assessment ? (assessment.score - 0.6) * 0.25 : 0;
  const updatedMastery = {} as Record<ConceptId, MasteryEstimate>;
  for (const conceptId of CONCEPT_ORDER) {
    const previous = student.mastery[conceptId];
    const score = Math.max(0, Math.min(1, previous.score + delta));
    updatedMastery[conceptId] = {
      score,
      confidence: Math.min(0.95, previous.confidence + 0.08),
      trend: score > previous.score + 0.01 ? "rising" : score < previous.score - 0.01 ? "falling" : "flat",
    };
  }
  return {
    ...student,
    mastery: updatedMastery,
    last_room: move ? move.to_room : roomOf(student.student_id),
  };
});

export const mockLessonPlan = {
  plan_id: "plan_tomorrow",
  run_id: MOCK_RUN_ID,
  headline:
    "Tomorrow: hold the distribution gain, retire the ledger for two students, and put justification in front of Summit.",
  items: [
    {
      item_id: "li_1",
      title: "Open with a sign-of-the-factor warm-up",
      room_id: "ember",
      student_ids: ["stu_amara", "stu_diego"],
      concept_focus: ["integer_operations", "distributive_property"],
      action:
        "Four expansions, each with a negative leading factor. No solving. Two minutes, whole-class share-out.",
      rationale:
        "The Ember gain held on 3 of 4 problems. A short isolated rep protects it before it is folded back into full solves.",
      evidence_refs: ["ev:assessment:asm_1", "ev:assessment:asm_2"],
      minutes: 8,
    },
    {
      item_id: "li_2",
      title: "Retire the step ledger for Priya, keep it for Micah",
      room_id: "forge",
      student_ids: ["stu_priya", "stu_micah"],
      concept_focus: ["equation_sequencing"],
      action:
        "Priya solves without the ledger. Micah keeps it, but fills only the operation column.",
      rationale:
        "Priya's ordering was correct on every problem with the ledger; the scaffold has done its job. Micah abandoned it mid-set, which is where the error returned.",
      evidence_refs: ["ev:assessment:asm_5", "ev:assessment:asm_4"],
      minutes: 12,
    },
    {
      item_id: "li_3",
      title: "Sorting without bands",
      room_id: "harbor",
      student_ids: ["stu_theo", "stu_nina", "stu_yusuf"],
      concept_focus: ["combining_like_terms"],
      action:
        "Same sorting task, color bands removed. Students annotate degree themselves before solving.",
      rationale:
        "Theo's error returns the moment bands are removed, so the transfer step needs to be practiced directly rather than assumed.",
      evidence_refs: ["ev:assessment:asm_9", "ev:assessment:asm_8"],
      minutes: 15,
    },
    {
      item_id: "li_4",
      title: "Summit writes the property, not the answer",
      room_id: "summit",
      student_ids: ["stu_ivy", "stu_ravi", "stu_hana"],
      concept_focus: ["equation_sequencing"],
      action:
        "Each student writes a two-sentence justification for the addition property, then trades and critiques.",
      rationale:
        "All three solve fluently; Hana's justification was correct but informal. Peer critique is the shortest path to precision here.",
      evidence_refs: ["ev:assessment:asm_12", "ev:assessment:asm_10"],
      minutes: 15,
    },
    {
      item_id: "li_5",
      title: "Read Diego's work with him",
      student_ids: ["stu_diego"],
      concept_focus: ["distributive_property"],
      action:
        "Five minutes one-on-one. Ask him to narrate steps three and four out loud before any correction.",
      rationale:
        "The grader could not read past step two and flagged low confidence. The machine should not decide this one.",
      evidence_refs: ["ev:assessment:asm_2", "ev:review:rev_1"],
      minutes: 5,
    },
  ],
} as unknown as LessonPlan;

export const mockReviewQueue = [
  {
    review_id: "rev_1",
    reason:
      "Grade confidence 0.41 on Diego R. Work is unreadable after step two; the final line does not follow from the visible steps.",
    agent: "assessment_agent",
    confidence: 0.41,
    subject_ref: "asm_2",
    evidence_refs: ["ev:submission:stu_diego:2026-05-13", "ev:assessment:asm_2"],
    status: "open",
  },
] as unknown as ReviewItem[];
