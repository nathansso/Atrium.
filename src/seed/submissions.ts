/**
 * Prepared (simulated) student submissions — Person C owned, append-only seed.
 *
 * Deterministic by design: these responses are hand-tuned against the demo
 * assignment (asgn-multistep-001) and the BKT parameters so the required demo
 * outcomes hold:
 *   - Ember's integer-operations intervention succeeds (4 of 5 improve).
 *   - Dev Patel (stu_02) produces the one low-confidence grade for review.
 *   - Forge (distributive property) becomes the largest remaining gap.
 *   - Maya Chen (stu_01) earns a scaffolding drop from high (3) to medium (2).
 *
 * `error_fingerprint` marks a known error pattern visible in the written work;
 * the Assessment Agent classifies misconceptions from it deterministically.
 */
import type { MisconceptionId } from "@/contracts";

export type SeedResponse = {
  question_id: string;
  answer: string;
  work_shown: string;
  /** Present when the written work exhibits a known error pattern. */
  error_fingerprint?: MisconceptionId;
  /** Defaults to "clear"; "ambiguous" work costs grading confidence. */
  legibility?: "clear" | "ambiguous";
};

export type SeedSubmission = {
  submission_id: string;
  student_id: string;
  responses: SeedResponse[];
};

/** Answer key for the demo assignment asgn-multistep-001. */
export const demoAnswerKey: Record<string, string> = {
  q1: "x = -11",
  q2: "x = -5",
  q3: "x = 6",
  q4: "x = 4",
  q5: "x = 7",
  q6: "x = 3",
};

export const demoSubmissions: SeedSubmission[] = [
  // --- Ember (integer operations intervention) --------------------------
  {
    submission_id: "sub-stu_01",
    student_id: "stu_01",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; 2x = -10; x = -5" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30; 3x = 26",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; 6x = 24; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "4x - 2x = 5 + 9; 2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; 3x = 9; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_02",
    student_id: "stu_02",
    responses: [
      {
        question_id: "q1",
        answer: "x = 3",
        work_shown: "x = 7 - 4 = 3",
        error_fingerprint: "sign_error_negatives",
      },
      {
        question_id: "q2",
        answer: "x = 5",
        work_shown: "2x = 10?? (crossed out -10, rewrote 10)",
        error_fingerprint: "sign_error_negatives",
        legibility: "ambiguous",
      },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q4", answer: "x = 9", work_shown: "scratched-out steps, no readable path" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 5", work_shown: "" },
    ],
  },
  {
    submission_id: "sub-stu_03",
    student_id: "stu_03",
    responses: [
      {
        question_id: "q1",
        answer: "x = 3",
        work_shown: "x = 7 - 4 = 3",
        error_fingerprint: "sign_error_negatives",
      },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; 2x = -10; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3x + 12 = 30; 3x = 18; x = 6" },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; 6x = 24" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      {
        question_id: "q6",
        answer: "x = 2",
        work_shown: "7x + 2 - 4x + 1 -> 6x = 12",
        error_fingerprint: "like_terms_overcombine",
      },
    ],
  },
  {
    submission_id: "sub-stu_04",
    student_id: "stu_04",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x = -10; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3x + 12 = 30; x = 6" },
      {
        question_id: "q4",
        answer: "x = 10/3",
        work_shown: "divided by 2 first: 3x - 5 + 4 = 9; 3x = 10",
        error_fingerprint: "operation_order_confusion",
      },
      {
        question_id: "q5",
        answer: "x = 7/3",
        work_shown: "4x + 2x = 5 + 9; 6x = 14",
        error_fingerprint: "operation_order_confusion",
      },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_05",
    student_id: "stu_05",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30; 3x = 26",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x = 9; x = 3" },
    ],
  },
  // --- Forge (partial distribution persists) ----------------------------
  {
    submission_id: "sub-stu_06",
    student_id: "stu_06",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x = -10; x = -5" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30",
        error_fingerprint: "partial_distribution",
      },
      {
        question_id: "q4",
        answer: "x = 19/6",
        work_shown: "6x - 5 + 4 = 18; 6x = 19",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_07",
    student_id: "stu_07",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x = -10" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30",
        error_fingerprint: "partial_distribution",
      },
      {
        question_id: "q4",
        answer: "x = 19/6",
        work_shown: "6x - 5 + 4 = 18",
        error_fingerprint: "partial_distribution",
      },
      {
        question_id: "q5",
        answer: "x = 7/3",
        work_shown: "4x + 2x = 5 + 9; 6x = 14",
        error_fingerprint: "operation_order_confusion",
      },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12" },
    ],
  },
  {
    submission_id: "sub-stu_08",
    student_id: "stu_08",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30; 3x = 26",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q4", answer: "x = 4", work_shown: "box model: 6x - 10; 6x - 6 = 18; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_09",
    student_id: "stu_09",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      {
        question_id: "q2",
        answer: "x = -1",
        work_shown: "5x - 3x + 4 -> 6x = -6",
        error_fingerprint: "like_terms_overcombine",
      },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30",
        error_fingerprint: "partial_distribution",
      },
      {
        question_id: "q4",
        answer: "x = 19/6",
        work_shown: "6x - 5 + 4 = 18",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      {
        question_id: "q6",
        answer: "x = 2",
        work_shown: "7x + 2 - 4x + 1 -> 6x = 12",
        error_fingerprint: "like_terms_overcombine",
      },
    ],
  },
  // --- Harbor (sequencing transfer) --------------------------------------
  {
    submission_id: "sub-stu_10",
    student_id: "stu_10",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3x + 12 = 30; x = 6" },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; 6x = 24; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "4x - 2x = 5 + 9; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_11",
    student_id: "stu_11",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x = -10; x = -5" },
      {
        question_id: "q3",
        answer: "x = 26/3",
        work_shown: "3x + 4 = 30",
        error_fingerprint: "partial_distribution",
      },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "subtract 2x both sides, then add 9: x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_12",
    student_id: "stu_12",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3x + 12 = 30; x = 6" },
      {
        question_id: "q4",
        answer: "x = 10/3",
        work_shown: "divided by 2 before distributing: 3x - 5 + 4 = 9",
        error_fingerprint: "operation_order_confusion",
      },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  // --- Summit (extension holds) ------------------------------------------
  {
    submission_id: "sub-stu_13",
    student_id: "stu_13",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3x + 12 = 30; x = 6" },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 6 = 18; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_14",
    student_id: "stu_14",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "3(x + 4) = 30; x + 4 = 10; x = 6" },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 6 = 18; 6x = 24; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
  {
    submission_id: "sub-stu_15",
    student_id: "stu_15",
    responses: [
      { question_id: "q1", answer: "x = -11", work_shown: "x = -4 - 7 = -11" },
      { question_id: "q2", answer: "x = -5", work_shown: "2x + 4 = -6; x = -5" },
      { question_id: "q3", answer: "x = 6", work_shown: "x + 4 = 10; x = 6" },
      { question_id: "q4", answer: "x = 4", work_shown: "6x - 10 + 4 = 18; x = 4" },
      { question_id: "q5", answer: "x = 7", work_shown: "2x = 14; x = 7" },
      { question_id: "q6", answer: "x = 3", work_shown: "3x + 3 = 12; x = 3" },
    ],
  },
];

export function getSubmissionForStudent(studentId: string): SeedSubmission | undefined {
  return demoSubmissions.find((submission) => submission.student_id === studentId);
}
