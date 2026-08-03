import { assignmentSchema, type Assignment } from "@/contracts";

/**
 * The demo assignment. Person B owns this file; Person C appends submission
 * seeds elsewhere. Everything here is fixed so the demo runs identically on
 * every machine with no network dependency.
 */
export const DEMO_ASSIGNMENT_ID = "asg_multistep_equations_01";

const rawDemoAssignment: Assignment = {
  assignment_id: DEMO_ASSIGNMENT_ID,
  title: "Multi-Step Equations Check-In",
  course: "Algebra I",
  source: "demo_seed",
  teaching_intent:
    "Check whether students can isolate a variable across multi-step equations without losing sign accuracy or skipping distribution.",
  professor_constraints: [
    "Keep the assignment to one class period.",
    "Every student answers the same number of graded items.",
    "No calculators on items that test signed arithmetic.",
  ],
  objectives: [
    {
      objective_id: "obj_integer_operations",
      statement:
        "Add and subtract signed integers accurately while simplifying a multi-step equation.",
      concept: "integer_operations",
    },
    {
      objective_id: "obj_distributive_property",
      statement:
        "Distribute a factor across every term inside a grouped expression.",
      concept: "distributive_property",
    },
    {
      objective_id: "obj_equation_sequencing",
      statement:
        "Order inverse operations correctly to isolate the variable in a multi-step equation.",
      concept: "equation_sequencing",
    },
    {
      objective_id: "obj_combining_like_terms",
      statement:
        "Combine like terms without altering terms that are already simplified.",
      concept: "combining_like_terms",
    },
  ],
  questions: [
    {
      question_id: "q1",
      prompt: "Simplify: -7 + (-4) - (-9)",
      concepts: ["integer_operations"],
      difficulty: 0.35,
      expected_minutes: 2,
      objective_id: "obj_integer_operations",
    },
    {
      question_id: "q2",
      prompt: "Solve for x: x - 12 = -5",
      concepts: ["integer_operations"],
      difficulty: 0.4,
      expected_minutes: 2,
      objective_id: "obj_integer_operations",
    },
    {
      question_id: "q3",
      prompt: "Solve for n: -3 - n = 8",
      concepts: ["integer_operations"],
      difficulty: 0.55,
      expected_minutes: 3,
      objective_id: "obj_integer_operations",
    },
    {
      question_id: "q4",
      prompt: "Expand: 4(x + 6)",
      concepts: ["distributive_property"],
      difficulty: 0.3,
      expected_minutes: 2,
      objective_id: "obj_distributive_property",
    },
    {
      question_id: "q5",
      prompt: "Expand: -2(3y - 7)",
      concepts: ["distributive_property", "integer_operations"],
      difficulty: 0.6,
      expected_minutes: 3,
      objective_id: "obj_distributive_property",
    },
    {
      question_id: "q6",
      prompt: "Solve for x: 5(x - 3) = 20",
      concepts: ["distributive_property", "equation_sequencing"],
      difficulty: 0.65,
      expected_minutes: 4,
      objective_id: "obj_distributive_property",
    },
    {
      question_id: "q7",
      prompt: "Solve for x: 3x + 7 = 22",
      concepts: ["equation_sequencing"],
      difficulty: 0.45,
      expected_minutes: 3,
      objective_id: "obj_equation_sequencing",
    },
    {
      question_id: "q8",
      prompt: "Solve for x: (x / 4) - 6 = 1",
      concepts: ["equation_sequencing"],
      difficulty: 0.7,
      expected_minutes: 4,
      objective_id: "obj_equation_sequencing",
    },
    {
      question_id: "q9",
      prompt: "Simplify: 6x + 3 - 2x + 9",
      concepts: ["combining_like_terms"],
      difficulty: 0.4,
      expected_minutes: 2,
      objective_id: "obj_combining_like_terms",
    },
    {
      question_id: "q10",
      prompt: "Solve for x: 8x - 5 - 3x = 25",
      concepts: ["combining_like_terms", "equation_sequencing"],
      difficulty: 0.75,
      expected_minutes: 5,
      objective_id: "obj_combining_like_terms",
    },
  ],
};

/** Validated once at module load so a malformed seed fails loudly. */
export const demoAssignment: Assignment =
  assignmentSchema.parse(rawDemoAssignment);

export function getSeedAssignment(assignmentId?: string): Assignment | null {
  if (!assignmentId || assignmentId === DEMO_ASSIGNMENT_ID) {
    return structuredClone(demoAssignment);
  }
  return null;
}
