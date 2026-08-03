import { studentSchema, type Student } from "@/contracts";

/**
 * Fifteen synthetic Algebra I students.
 *
 * Design notes:
 * - Barriers are academic, not diagnostic. Documented supports are attached
 *   independently of the barrier so grouping cannot secretly track them.
 * - Two Summit-level students carry documented supports on purpose: it proves
 *   accommodations do not pull a student out of extension work.
 * - No real student data. Names and histories are invented for the demo.
 */
const rawStudents: Student[] = [
  {
    student_id: "stu_01",
    display_name: "Amara Okafor",
    avatar_key: "avatar_01",
    supports: ["extended_time", "chunked_steps"],
    mastery: {
      integer_operations: { score: 0.3, confidence: 0.82, trend: "falling" },
      distributive_property: { score: 0.58, confidence: 0.7, trend: "flat" },
      equation_sequencing: { score: 0.55, confidence: 0.68, trend: "flat" },
      combining_like_terms: { score: 0.62, confidence: 0.72, trend: "rising" },
    },
    recent_patterns: ["sign_error_on_subtraction", "drops_negative_coefficient"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_02",
    display_name: "Ben Whitfield",
    avatar_key: "avatar_02",
    supports: ["reduced_visual_density"],
    mastery: {
      integer_operations: { score: 0.68, confidence: 0.74, trend: "flat" },
      distributive_property: { score: 0.32, confidence: 0.83, trend: "falling" },
      equation_sequencing: { score: 0.59, confidence: 0.69, trend: "flat" },
      combining_like_terms: { score: 0.55, confidence: 0.7, trend: "flat" },
    },
    recent_patterns: ["partial_distribution", "distributes_only_first_term"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_03",
    display_name: "Chidi Nwosu",
    avatar_key: "avatar_03",
    supports: ["quiet_start"],
    mastery: {
      integer_operations: { score: 0.64, confidence: 0.72, trend: "flat" },
      distributive_property: { score: 0.6, confidence: 0.7, trend: "flat" },
      equation_sequencing: { score: 0.34, confidence: 0.82, trend: "falling" },
      combining_like_terms: { score: 0.57, confidence: 0.69, trend: "flat" },
    },
    recent_patterns: ["operation_order_inversion", "inverse_operation_misapplied"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_04",
    display_name: "Diego Marin",
    avatar_key: "avatar_04",
    supports: ["text_to_speech", "large_print"],
    mastery: {
      integer_operations: { score: 0.36, confidence: 0.78, trend: "flat" },
      distributive_property: { score: 0.61, confidence: 0.7, trend: "rising" },
      equation_sequencing: { score: 0.57, confidence: 0.66, trend: "flat" },
      combining_like_terms: { score: 0.6, confidence: 0.7, trend: "flat" },
    },
    recent_patterns: ["sign_error_on_subtraction"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_05",
    display_name: "Elena Petrova",
    avatar_key: "avatar_05",
    supports: [],
    mastery: {
      integer_operations: { score: 0.92, confidence: 0.88, trend: "flat" },
      distributive_property: { score: 0.9, confidence: 0.86, trend: "rising" },
      equation_sequencing: { score: 0.94, confidence: 0.89, trend: "flat" },
      combining_like_terms: { score: 0.91, confidence: 0.87, trend: "rising" },
    },
    recent_patterns: [],
    scaffolding_level: 1,
  },
  {
    student_id: "stu_06",
    display_name: "Farah Haddad",
    avatar_key: "avatar_06",
    supports: ["translated_glossary", "extended_time"],
    mastery: {
      integer_operations: { score: 0.71, confidence: 0.76, trend: "rising" },
      distributive_property: { score: 0.38, confidence: 0.8, trend: "flat" },
      equation_sequencing: { score: 0.62, confidence: 0.7, trend: "flat" },
      combining_like_terms: { score: 0.57, confidence: 0.69, trend: "flat" },
    },
    recent_patterns: ["partial_distribution"],
    scaffolding_level: 2,
  },
  {
    student_id: "stu_07",
    display_name: "Grace Lindqvist",
    avatar_key: "avatar_07",
    supports: ["extended_time"],
    mastery: {
      integer_operations: { score: 0.67, confidence: 0.73, trend: "rising" },
      distributive_property: { score: 0.63, confidence: 0.71, trend: "flat" },
      equation_sequencing: { score: 0.39, confidence: 0.8, trend: "flat" },
      combining_like_terms: { score: 0.6, confidence: 0.7, trend: "flat" },
    },
    recent_patterns: ["operation_order_inversion"],
    scaffolding_level: 2,
  },
  {
    student_id: "stu_08",
    display_name: "Hana Suzuki",
    avatar_key: "avatar_08",
    supports: [],
    mastery: {
      integer_operations: { score: 0.33, confidence: 0.8, trend: "falling" },
      distributive_property: { score: 0.55, confidence: 0.68, trend: "flat" },
      equation_sequencing: { score: 0.6, confidence: 0.7, trend: "rising" },
      combining_like_terms: { score: 0.58, confidence: 0.69, trend: "flat" },
    },
    recent_patterns: ["drops_negative_coefficient", "sign_error_on_subtraction"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_09",
    display_name: "Isaac Levy",
    avatar_key: "avatar_09",
    supports: ["extended_time"],
    mastery: {
      integer_operations: { score: 0.89, confidence: 0.86, trend: "flat" },
      distributive_property: { score: 0.93, confidence: 0.88, trend: "rising" },
      equation_sequencing: { score: 0.88, confidence: 0.85, trend: "flat" },
      combining_like_terms: { score: 0.9, confidence: 0.86, trend: "flat" },
    },
    recent_patterns: [],
    scaffolding_level: 1,
  },
  {
    student_id: "stu_10",
    display_name: "Jonah Reed",
    avatar_key: "avatar_10",
    supports: ["chunked_steps"],
    mastery: {
      integer_operations: { score: 0.66, confidence: 0.73, trend: "flat" },
      distributive_property: { score: 0.35, confidence: 0.81, trend: "falling" },
      equation_sequencing: { score: 0.58, confidence: 0.68, trend: "falling" },
      combining_like_terms: { score: 0.52, confidence: 0.7, trend: "flat" },
    },
    recent_patterns: ["distributes_only_first_term", "partial_distribution"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_11",
    display_name: "Kavya Iyer",
    avatar_key: "avatar_11",
    supports: ["manipulative_visuals"],
    mastery: {
      integer_operations: { score: 0.62, confidence: 0.71, trend: "flat" },
      distributive_property: { score: 0.58, confidence: 0.69, trend: "flat" },
      equation_sequencing: { score: 0.37, confidence: 0.81, trend: "falling" },
      combining_like_terms: { score: 0.49, confidence: 0.72, trend: "falling" },
    },
    recent_patterns: ["operation_order_inversion", "combines_unlike_terms"],
    scaffolding_level: 3,
  },
  {
    student_id: "stu_12",
    display_name: "Lucia Ferrari",
    avatar_key: "avatar_12",
    supports: ["frequent_check_ins"],
    mastery: {
      integer_operations: { score: 0.41, confidence: 0.75, trend: "rising" },
      distributive_property: { score: 0.63, confidence: 0.71, trend: "flat" },
      equation_sequencing: { score: 0.58, confidence: 0.68, trend: "flat" },
      combining_like_terms: { score: 0.64, confidence: 0.73, trend: "rising" },
    },
    recent_patterns: ["sign_error_on_subtraction"],
    scaffolding_level: 2,
  },
  {
    student_id: "stu_13",
    display_name: "Mei Zhang",
    avatar_key: "avatar_13",
    supports: ["text_to_speech"],
    mastery: {
      integer_operations: { score: 0.87, confidence: 0.85, trend: "rising" },
      distributive_property: { score: 0.88, confidence: 0.85, trend: "flat" },
      equation_sequencing: { score: 0.9, confidence: 0.86, trend: "flat" },
      combining_like_terms: { score: 0.92, confidence: 0.87, trend: "rising" },
    },
    recent_patterns: [],
    scaffolding_level: 1,
  },
  {
    student_id: "stu_14",
    display_name: "Nia Campbell",
    avatar_key: "avatar_14",
    supports: [],
    mastery: {
      integer_operations: { score: 0.7, confidence: 0.75, trend: "flat" },
      distributive_property: { score: 0.43, confidence: 0.77, trend: "rising" },
      equation_sequencing: { score: 0.61, confidence: 0.69, trend: "rising" },
      combining_like_terms: { score: 0.59, confidence: 0.71, trend: "flat" },
    },
    recent_patterns: ["partial_distribution"],
    scaffolding_level: 2,
  },
  {
    student_id: "stu_15",
    display_name: "Omar Farouk",
    avatar_key: "avatar_15",
    supports: ["read_aloud_directions"],
    mastery: {
      integer_operations: { score: 0.69, confidence: 0.74, trend: "rising" },
      distributive_property: { score: 0.61, confidence: 0.7, trend: "rising" },
      equation_sequencing: { score: 0.44, confidence: 0.78, trend: "rising" },
      combining_like_terms: { score: 0.58, confidence: 0.7, trend: "flat" },
    },
    recent_patterns: ["inverse_operation_misapplied"],
    scaffolding_level: 2,
  },
];

/**
 * Successful scaffolds recorded from previous units. The Student Memory Agent
 * surfaces these so the Curator can reuse what already worked.
 */
export const successfulScaffolds: Record<string, string[]> = {
  stu_01: ["number line for signed subtraction", "two-color chip model"],
  stu_02: ["area model for distribution", "arrow annotations on every term"],
  stu_03: ["written step ledger before solving", "undo-order checklist"],
  stu_04: ["spoken worked example then silent retry"],
  stu_05: ["open-ended extension prompts"],
  stu_06: ["glossary card for operation verbs", "area model for distribution"],
  stu_07: ["undo-order checklist"],
  stu_08: ["two-color chip model", "sign-tracking margin notes"],
  stu_09: ["peer explanation role"],
  stu_10: ["area model for distribution", "one term per line rewriting"],
  stu_11: ["physical tiles for like terms", "undo-order checklist"],
  stu_12: ["number line for signed subtraction"],
  stu_13: ["multi-representation challenge"],
  stu_14: ["arrow annotations on every term"],
  stu_15: ["undo-order checklist", "read-aloud restatement of the goal"],
};

/** Validated once at module load so a malformed seed fails loudly. */
export const seedStudents: Student[] = rawStudents.map((student) =>
  studentSchema.parse(student),
);

export function getSeedStudents(): Student[] {
  return structuredClone(seedStudents);
}

export function getSeedStudent(studentId: string): Student | null {
  const found = seedStudents.find((s) => s.student_id === studentId);
  return found ? structuredClone(found) : null;
}
