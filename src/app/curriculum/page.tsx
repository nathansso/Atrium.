import type { Metadata } from "next";
import Link from "next/link";
import { CurriculumResearchPanel } from "@/components/curriculum/CurriculumResearchPanel";
import { AtriumIcon } from "@/components/ui/atrium-icons";
import { AtriumSectionNav } from "@/components/ui/atrium-section-nav";

export const metadata: Metadata = {
  title: "Atrium — Research Studio",
  description: "Source-grounded curriculum authoring: research, review citations, approve.",
};

export default function CurriculumPage() {
  return (
    <main className="research-page">
      <header className="research-appbar">
        <Link href="/" className="brand research-appbar__brand" aria-label="Atrium home">
          <span className="brand__wordmark">Atrium</span>
          <span className="brand__descriptor">Adaptive classroom intelligence</span>
        </Link>

        <AtriumSectionNav current="research" />

        <span className="status-pill research-appbar__status">
          <AtriumIcon name="research" size={18} />
          Preview workspace
        </span>
      </header>
      <CurriculumResearchPanel />
    </main>
  );
}
