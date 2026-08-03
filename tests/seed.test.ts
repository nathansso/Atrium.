import { describe, expect, it } from "vitest";
import { conceptIds, studentSchema, assignmentSchema } from "@/contracts";
import { demoAssignment } from "@/seed/assignment";
import { seedStudents, successfulScaffolds } from "@/seed/students";

describe("seed data", () => {
  it("has exactly 15 synthetic Algebra I students", () => {
    expect(seedStudents).toHaveLength(15);
    for (const student of seedStudents) {
      expect(() => studentSchema.parse(student)).not.toThrow();
    }
  });

  it("gives every student a unique id and a mastery estimate per concept", () => {
    const ids = seedStudents.map((s) => s.student_id);
    expect(new Set(ids).size).toBe(15);
    for (const student of seedStudents) {
      for (const concept of conceptIds) {
        expect(student.mastery[concept]).toBeDefined();
      }
    }
  });

  it("records successful scaffolds for every student", () => {
    for (const student of seedStudents) {
      expect(successfulScaffolds[student.student_id]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("covers exactly the four Algebra I concepts in the assignment", () => {
    expect(() => assignmentSchema.parse(demoAssignment)).not.toThrow();
    const covered = new Set(demoAssignment.questions.flatMap((q) => q.concepts));
    expect([...covered].sort()).toEqual([...conceptIds].sort());
    expect(demoAssignment.course).toBe("Algebra I");
  });

  it("maps every question to a declared objective", () => {
    const declared = new Set(demoAssignment.objectives.map((o) => o.objective_id));
    for (const question of demoAssignment.questions) {
      expect(declared.has(question.objective_id)).toBe(true);
    }
  });
});
