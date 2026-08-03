import Link from "next/link";
import styles from "./AtriumLanding.module.css";

const steps = [
  {
    number: "01",
    title: "Remember",
    copy: "Atrium reads the classroom graph to recover mastery, misconceptions, supports, and the evidence behind each one.",
  },
  {
    number: "02",
    title: "Explain",
    copy: "Eight specialist agents trace why students are stuck, then propose learning rooms around shared academic barriers.",
  },
  {
    number: "03",
    title: "Rebuild",
    copy: "The assignment adapts by room without changing the objective. As new work arrives, students move and rooms reform.",
  },
  {
    number: "04",
    title: "Plan",
    copy: "The professor reviews uncertain grades and approves an evidence-backed plan for the next day of teaching.",
  },
];

const sponsors = [
  { name: "FalkorDB", role: "Memory", detail: "Classroom knowledge graph" },
  { name: "LaserData", role: "Live", detail: "Ordered event stream" },
  { name: "RocketRide", role: "Motion", detail: "Assignment pipelines" },
  { name: "Guild.ai", role: "Judgment", detail: "Agents and approval gates" },
  { name: "Snyk", role: "Security", detail: "Automated code protection" },
];

export function AtriumLanding() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Atrium home">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
          </span>
          <span>ATRIUM</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#system">System</a>
          <a href="#principles">Principles</a>
        </nav>

          <Link className={styles.headerCta} href="/curriculum">
            Research a curriculum
          <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> Built for Memory Meets Motion
            </p>
            <h1>
              A classroom that remembers.
              <span>A school that moves.</span>
            </h1>
            <p className={styles.heroLead}>
              Atrium turns one assignment into a living plan for every learner.
              It recalls prior barriers, forms explainable learning rooms, adapts
              the work, and brings the professor in for the decisions that matter.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/curriculum">
                Research a curriculum
                <span aria-hidden="true">→</span>
              </Link>
              <a className={styles.secondaryCta} href="#how">
                See how it works
              </a>
            </div>
            <div className={styles.heroProof} aria-label="Platform proof points">
              <span><strong>8</strong> specialist agents</span>
              <span><strong>2</strong> human approval gates</span>
              <span><strong>11</strong> live event types</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="Atrium living school system map">
            <div className={styles.visualTopbar}>
              <span className={styles.liveDot} />
              <span>CLASSROOM RUN 08</span>
              <span className={styles.visualStage}>ROOMS FORMING</span>
            </div>
            <div className={styles.campus}>
              <div className={styles.gridPlane} />
              <div className={`${styles.room} ${styles.roomEmber}`}>
                <span className={styles.roomRoof} />
                <span className={styles.roomFace} />
                <span className={styles.roomLabel}>EMBER</span>
              </div>
              <div className={`${styles.room} ${styles.roomHarbor}`}>
                <span className={styles.roomRoof} />
                <span className={styles.roomFace} />
                <span className={styles.roomLabel}>HARBOR</span>
              </div>
              <div className={`${styles.room} ${styles.roomForge}`}>
                <span className={styles.roomRoof} />
                <span className={styles.roomFace} />
                <span className={styles.roomLabel}>FORGE</span>
              </div>
              <div className={`${styles.room} ${styles.roomSummit}`}>
                <span className={styles.roomRoof} />
                <span className={styles.roomFace} />
                <span className={styles.roomLabel}>SUMMIT</span>
              </div>
              <div className={styles.tower}>
                <span />
                <small>PROFESSOR</small>
              </div>
              <div className={styles.beacon}>
                <span />
                <i />
              </div>
              <div className={`${styles.student} ${styles.studentOne}`} />
              <div className={`${styles.student} ${styles.studentTwo}`} />
              <div className={`${styles.student} ${styles.studentThree}`} />
              <div className={`${styles.student} ${styles.studentFour}`} />
              <div className={styles.signalLine} />
              <div className={styles.eventCard}>
                <span>AGENT EVENT</span>
                <strong>groups.proposed</strong>
                <small>4 rooms built from 3 shared barriers</small>
              </div>
              <div className={styles.memoryCard}>
                <span>MEMORY PATH</span>
                <strong>Maya → sign error → integers</strong>
              </div>
            </div>
            <div className={styles.visualFooter}>
              <span>Memory graph connected</span>
              <span>Event offset 0248</span>
            </div>
          </div>
        </section>

        <section className={styles.signalStrip} aria-label="Atrium capabilities">
          <span>GRAPH MEMORY</span>
          <i />
          <span>LIVE EVENT SPINE</span>
          <i />
          <span>HUMAN APPROVAL</span>
          <i />
          <span>SECURE BY DEFAULT</span>
        </section>

        <section className={styles.insight}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>THE CORE INSIGHT</p>
            <h2>Same score. Different barrier.</h2>
            <p>
              A grade tells you what happened. Atrium traces why it happened, so
              the next intervention is built from evidence instead of averages.
            </p>
          </div>

          <div className={styles.studentComparison}>
            <article className={styles.studentCard}>
              <div className={styles.studentHeader}>
                <span className={`${styles.avatar} ${styles.avatarMaya}`}>M</span>
                <div><strong>Maya</strong><small>40% on integer operations</small></div>
                <span className={styles.score}>40%</span>
              </div>
              <div className={styles.path}>
                <span>STUDENT</span><i />
                <span>MISCONCEPTION</span><i />
                <span>CONCEPT</span>
              </div>
              <p>Drops the negative sign when the visual number line is removed.</p>
              <div className={styles.roomAssignment}><span /> Ember room · visual sign support</div>
            </article>

            <div className={styles.notEqual} aria-label="Not equal">≠</div>

            <article className={styles.studentCard}>
              <div className={styles.studentHeader}>
                <span className={`${styles.avatar} ${styles.avatarDevan}`}>D</span>
                <div><strong>Devan</strong><small>40% on integer operations</small></div>
                <span className={styles.score}>40%</span>
              </div>
              <div className={styles.path}>
                <span>STUDENT</span><i />
                <span>MISCONCEPTION</span><i />
                <span>CONCEPT</span>
              </div>
              <p>Understands the signs, but applies the operations out of sequence.</p>
              <div className={styles.roomAssignment}><span /> Harbor room · ordered steps</div>
            </article>
          </div>
        </section>

        <section className={styles.how} id="how">
          <div className={styles.sectionHeadingRow}>
            <div>
              <p className={styles.kicker}>ONE CONTINUOUS LOOP</p>
              <h2>From assignment to tomorrow.</h2>
            </div>
            <p>
              Every decision stays connected to evidence, visible in the world,
              and reviewable by the educator.
            </p>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <article className={styles.step} key={step.number}>
                <span className={styles.stepNumber}>{step.number}</span>
                <div className={styles.stepIcon} aria-hidden="true"><span /></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.system} id="system">
          <div className={styles.systemCopy}>
            <p className={styles.kicker}>THE LIVING SCHOOL</p>
            <h2>The system explains itself by moving.</h2>
            <p>
              Rooms rise when groups form. Students move when mastery changes.
              Signals pulse as events stream in. The next teaching plan appears
              as a preview of tomorrow&apos;s school.
            </p>
            <ul>
              <li><span>01</span> Click any room to see the barrier behind it.</li>
              <li><span>02</span> Follow every agent handoff in the live feed.</li>
              <li><span>03</span> Inspect the graph path behind each decision.</li>
              <li><span>04</span> Pause and approve at both human gates.</li>
            </ul>
            <Link className={styles.inlineLink} href="/demo">
              Explore the interactive world <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.interfaceCard}>
            <div className={styles.interfaceTop}>
              <span><i /> LIVE API</span>
              <span>ASSESSMENT IN PROGRESS</span>
            </div>
            <div className={styles.interfaceBody}>
              <div className={styles.miniWorld}>
                <span className={styles.miniBuildingOne} />
                <span className={styles.miniBuildingTwo} />
                <span className={styles.miniBuildingThree} />
                <span className={styles.miniBuildingFour} />
                <span className={styles.miniPathOne} />
                <span className={styles.miniPathTwo} />
              </div>
              <div className={styles.agentPanel}>
                <span>AGENT FEED</span>
                <div><i className={styles.complete} /><p><strong>Grouping Agent</strong><small>4 rooms proposed</small></p></div>
                <div><i className={styles.complete} /><p><strong>Accessibility Agent</strong><small>Supports preserved</small></p></div>
                <div><i className={styles.active} /><p><strong>Assessment Agent</strong><small>Reviewing 24 submissions</small></p></div>
                <div><i /><p><strong>Lesson Planner</strong><small>Waiting for mastery update</small></p></div>
              </div>
            </div>
            <div className={styles.interfaceTimeline}>
              <span className={styles.timelineDone} /><span className={styles.timelineDone} />
              <span className={styles.timelineDone} /><span className={styles.timelineActive} />
              <span /><span /><span /><span />
            </div>
          </div>
        </section>

        <section className={styles.stack}>
          <div className={styles.sectionHeadingRow}>
            <div>
              <p className={styles.kicker}>REAL INTEGRATIONS</p>
              <h2>Five technologies. Five clear jobs.</h2>
            </div>
            <p>
              Each layer owns a distinct responsibility. None of the sponsor
              integrations are decorative.
            </p>
          </div>
          <div className={styles.sponsorGrid}>
            {sponsors.map((sponsor, index) => (
              <article className={styles.sponsorCard} key={sponsor.name}>
                <span className={styles.sponsorIndex}>0{index + 1}</span>
                <div className={styles.sponsorGlyph} aria-hidden="true"><span /></div>
                <strong>{sponsor.name}</strong>
                <small>{sponsor.role}</small>
                <p>{sponsor.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.principles} id="principles">
          <div className={styles.principleStatement}>
            <p className={styles.kicker}>RESPONSIBLE PERSONALIZATION</p>
            <h2>Personalized support. The same high bar.</h2>
            <p>
              Atrium groups by current academic barrier, never by diagnosis.
              Accessibility changes presentation, pacing, and support while the
              learning objective stays fixed.
            </p>
          </div>
          <div className={styles.principleList}>
            <div><span>01</span><p><strong>Evidence first</strong>Every room links back to a graph path and classroom evidence.</p></div>
            <div><span>02</span><p><strong>Humans stay responsible</strong>Uncertain grades and final plans require educator approval.</p></div>
            <div><span>03</span><p><strong>Memory compounds</strong>Each assignment improves the model used for the next one.</p></div>
            <div><span>04</span><p><strong>Security runs quietly</strong>Snyk checks every code change outside the classroom runtime.</p></div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaGlow} />
          <p className={styles.kicker}>THE CLASSROOM IS READY</p>
          <h2>Watch one assignment rebuild the school.</h2>
          <p>
            Start with a synthetic Algebra I class, then follow every room,
            decision, and movement from upload to tomorrow&apos;s lesson plan.
          </p>
          <Link className={styles.primaryCta} href="/curriculum">
            Build a learning run <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark} aria-hidden="true"><span /></span>
          <span>ATRIUM</span>
        </Link>
        <p>A classroom with memory, in motion.</p>
        <div><span>Memory Meets Motion</span><span>San Francisco · 2026</span></div>
      </footer>
    </div>
  );
}
