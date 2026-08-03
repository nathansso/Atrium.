import Link from "next/link";

import { AtriumIcon, type AtriumIconName } from "@/components/ui/atrium-icons";

export type AtriumSection = "classroom" | "research";

export interface AtriumSectionNavProps {
  current: AtriumSection;
  className?: string;
}

const SECTIONS: ReadonlyArray<{
  id: AtriumSection;
  href: string;
  icon: AtriumIconName;
  label: string;
}> = [
  { id: "classroom", href: "/", icon: "classroom", label: "Classroom" },
  { id: "research", href: "/curriculum", icon: "research", label: "Research" },
];

export function AtriumSectionNav({ current, className }: AtriumSectionNavProps) {
  return (
    <nav
      aria-label="Atrium sections"
      className={["section-nav", className].filter(Boolean).join(" ")}
    >
      {SECTIONS.map((section) => {
        const isActive = section.id === current;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`section-nav__link${isActive ? " section-nav__link--active" : ""}`}
            href={section.href}
            key={section.id}
          >
            <AtriumIcon
              className="section-nav__icon"
              name={section.icon}
              size={20}
            />
            <span className="section-nav__label">{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
