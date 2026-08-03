import type { AgentEvent } from "@/contracts";
import { humanize } from "./payloads";

/**
 * One human sentence per event, shared by the agent feed and the advancement
 * toasts so the same event never gets two different descriptions.
 */
export function summarizeEvent(event: AgentEvent): string {
  const payload = event.payload ?? {};
  const count = (key: string) =>
    Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : null;

  switch (event.event_type) {
    case "assignment.uploaded":
      return "Assignment received from the professor";
    case "assignment.concepts.extracted":
      return `${count("concepts") ?? 0} concepts extracted`;
    case "student.context.ready":
      return `${count("students") ?? 0} student histories retrieved`;
    case "groups.proposed":
      return `${count("rooms") ?? 0} barrier-based rooms proposed`;
    case "accessibility.layers.ready":
      return `${count("layers") ?? 0} delivery layers attached`;
    case "assignment.variants.ready":
      return `${count("variants") ?? 0} room variants, objective preserved`;
    case "submissions.received":
      return `${count("submissions") ?? 0} submissions received`;
    case "assessment.completed":
      return `${count("assessments") ?? 0} submissions graded`;
    case "student.models.updated":
      return `${count("moves") ?? 0} students re-placed`;
    case "lesson.plan.ready":
      return "Tomorrow's plan is ready";
    case "approval.requested":
      return "A low-confidence grade needs your review";
    default:
      return humanize(event.event_type);
  }
}
