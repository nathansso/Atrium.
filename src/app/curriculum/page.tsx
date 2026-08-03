import type { Metadata } from "next";
import { CurriculumResearchPanel } from "@/components/curriculum/CurriculumResearchPanel";

export const metadata: Metadata = {
  title: "Atrium — Research Studio",
  description: "Source-grounded curriculum authoring: research, review citations, approve.",
};

export default function CurriculumPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--void)" }}>
      <CurriculumResearchPanel />
    </main>
  );
}
