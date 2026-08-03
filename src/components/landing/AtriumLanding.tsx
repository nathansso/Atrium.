import Link from "next/link";
import styles from "./AtriumLanding.module.css";

const steps = [
  {
    number: "01",
    icon: "M",
    title: "Remember",
    copy: "Recover mastery, misconceptions, supports, and the classroom evidence behind each one.",
  },
  {
    number: "02",
    icon: "E",
    title: "Explain",
    copy: "Trace why students are stuck, then propose learning rooms around shared academic barriers.",
  },
  {
    number: "03",
    icon: "R",
    title: "Rebuild",
    copy: "Adapt the assignment by room without changing the learning objective or lowering the bar.",
  },
  {
    number: "04",
    icon: "P",
    title: "Plan",
    copy: "Bring the professor in to review uncertain grades and approve tomorrow's teaching plan.",
  },
];

const sponsors = [
  { name: "FalkorDB", role: "Memory", detail: "Classroom knowledge graph", tone: "grape" },
  { name: "LaserData", role: "Live", detail: "Ordered event stream", tone: "sky" },
  { name: "RocketRide", role: "Motion", detail: "Assignment pipelines", tone: "flame" },
  { name: "Guild.ai", role: "Judgment", detail: "Agents and approval gates", tone: "lemon" },
  { name: "Snyk", role: "Security", detail: "Automated code protection", tone: "mint" },
];

export function AtriumLanding() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Atrium home">
          <span className={styles.brandMark} aria-hidden="true">A</span>
          <span>Atrium</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#why">Why Atrium</a>
          <a href="#how">The loop</a>
          <a href="#system">The school</a>
          <a href="#sponsors">Sponsors</a>
        </nav>

        <Link className={styles.headerCta} href="/curriculum">
          Research a curriculum <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span /> Built for Memory Meets Motion</p>
            <h1>
              A classroom that <em>remembers.</em>
              <span>A school that moves.</span>
            </h1>
            <p className={styles.heroLead}>
              Atrium turns one assignment into a living plan for every learner.
              It remembers prior barriers, forms explainable learning rooms, and
              brings the professor in for the decisions that matter.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/curriculum">
                Research a curriculum <span aria-hidden="true">→</span>
              </Link>
              <a className={styles.secondaryCta} href="#how">See how it works</a>
            </div>
            <div className={styles.heroProof} aria-label="Platform proof points">
              <span><strong>8</strong> specialist agents</span>
              <span><strong>2</strong> approval gates</span>
              <span><strong>11</strong> live event types</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="Atrium classroom result preview">
            <div className={styles.browserBar}>
              <span className={styles.browserDots}><i /><i /><i /></span>
              <span className={styles.browserTitle}>atrium / classroom run 08</span>
              <span className={styles.livePill}><i /> Live</span>
            </div>
            <div className={styles.searchPrompt}>
              <small>Today&apos;s classroom question</small>
              <strong>Why did Maya and Devan get the same score?</strong>
              <button type="button" aria-label="Run classroom analysis">→</button>
            </div>
            <div className={styles.resultHeader}>
              <div>
                <span>ANALYSIS COMPLETE</span>
                <h2>Same score. Different barrier.</h2>
              </div>
              <span className={styles.resultCount}>2 paths</span>
            </div>
            <div className={styles.resultCards}>
              <article>
                <span className={styles.studentAvatar}>M</span>
                <div><strong>Maya</strong><small>Visual sign support</small></div>
                <b>Ember</b>
              </article>
              <article>
                <span className={`${styles.studentAvatar} ${styles.studentAvatarBlue}`}>D</span>
                <div><strong>Devan</strong><small>Ordered step support</small></div>
                <b>Harbor</b>
              </article>
            </div>
            <div className={styles.pathDiagram} aria-hidden="true">
              <span className={styles.pathNode}>Evidence</span><i />
              <span className={styles.pathNode}>Barrier</span><i />
              <span className={`${styles.pathNode} ${styles.pathNodeActive}`}>Room</span>
            </div>
            <span className={`${styles.floatNote} ${styles.floatNoteOne}`}>Graph memory connected</span>
            <span className={`${styles.floatNote} ${styles.floatNoteTwo}`}>4 rooms forming</span>
          </div>
        </section>

        <section className={styles.signalStrip} aria-label="Atrium capabilities">
          <span>Graph memory</span><i />
          <span>Live event spine</span><i />
          <span>Human approval</span><i />
          <span>Secure by default</span>
        </section>

        <section className={styles.insight} id="why">
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>WHY ATRIUM</p>
            <h2>Short enough to understand. Deep enough to matter.</h2>
            <p>
              A grade tells you what happened. Atrium traces why it happened,
              so the next intervention comes from evidence instead of averages.
            </p>
          </div>
          <div className={styles.insightGrid}>
            <article className={styles.featureCard}>
              <div className={styles.featureTop}><span>Human in the loop</span><b>01</b></div>
              <div className={styles.professorCard}>
                <span>PF</span>
                <div><strong>Professor Flores</strong><small>Review requested</small></div>
                <b>2 gates</b>
              </div>
              <h3>Judgment stays human.</h3>
              <p>Uncertain grades and tomorrow&apos;s plan pause for educator review.</p>
            </article>
            <article className={`${styles.metricCard} ${styles.metricYellow}`}>
              <span>Remember</span><strong>24</strong><p>students connected to prior evidence</p>
            </article>
            <article className={`${styles.metricCard} ${styles.metricMint}`}>
              <span>Explain</span><strong>3</strong><p>shared academic barriers found</p>
            </article>
            <article className={`${styles.metricCard} ${styles.metricBerry}`}>
              <span>Rebuild</span><strong>4</strong><p>learning rooms ready to review</p>
            </article>
          </div>
        </section>

        <section className={styles.how} id="how">
          <div className={styles.sectionHeadingRow}>
            <div><p className={styles.kicker}>ONE CONTINUOUS LOOP</p><h2>From assignment to tomorrow.</h2></div>
            <p>Every decision stays connected to evidence, visible in the world, and reviewable by the educator.</p>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <article className={styles.step} key={step.number}>
                <div className={styles.stepTop}><span className={styles.stepIcon}>{step.icon}</span><span>{step.number}</span></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.system} id="system">
          <div className={styles.systemCopy}>
            <p className={styles.kicker}>MONDAY MORNING, IN MOTION</p>
            <h2>The system explains itself by moving.</h2>
            <p>
              Rooms rise when groups form. Students move when mastery changes.
              The next teaching plan appears as a preview of tomorrow&apos;s school.
            </p>
            <ul>
              <li><span>01</span> Open any room to see the barrier behind it.</li>
              <li><span>02</span> Follow every agent handoff in the live feed.</li>
              <li><span>03</span> Inspect the graph path behind each decision.</li>
              <li><span>04</span> Pause and approve at both human gates.</li>
            </ul>
            <Link className={styles.inlineLink} href="/demo">Explore the interactive world <span aria-hidden="true">→</span></Link>
          </div>

          <div className={styles.dashboard}>
            <div className={styles.dashboardNav}>
              <span className={styles.dashLogo}>A</span>
              <div><i /><i /><i /><i /></div>
              <span className={styles.dashAvatar}>PF</span>
            </div>
            <div className={styles.dashboardMain}>
              <div className={styles.dashboardHead}>
                <div><small>GOOD MORNING, PROFESSOR</small><h3>Today&apos;s classroom</h3></div>
                <span><i /> 3 agents working</span>
              </div>
              <div className={styles.dashboardStats}>
                <article><span>Mastery</span><strong>72%</strong><small>+8 this week</small></article>
                <article><span>Rooms</span><strong>04</strong><small>1 needs review</small></article>
                <article><span>Evidence</span><strong>148</strong><small>graph paths</small></article>
              </div>
              <div className={styles.dashboardBody}>
                <div className={styles.roomList}>
                  <span>LEARNING ROOMS</span>
                  <article><i className={styles.roomPurple} /><div><strong>Ember</strong><small>Visual sign support</small></div><b>6</b></article>
                  <article><i className={styles.roomBlue} /><div><strong>Harbor</strong><small>Ordered operations</small></div><b>7</b></article>
                  <article><i className={styles.roomYellow} /><div><strong>Forge</strong><small>Transfer practice</small></div><b>5</b></article>
                </div>
                <div className={styles.eventFeed}>
                  <span>LIVE AGENT FEED</span>
                  <div><i /><p><strong>Grouping complete</strong><small>4 rooms proposed</small></p></div>
                  <div><i /><p><strong>Supports preserved</strong><small>Accessibility checked</small></p></div>
                  <div><i className={styles.eventActive} /><p><strong>Reviewing evidence</strong><small>24 submissions</small></p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.stack} id="sponsors">
          <div className={styles.sectionHeadingRow}>
            <div><p className={styles.kicker}>REAL INTEGRATIONS</p><h2>Five technologies. Five clear jobs.</h2></div>
            <p>Each sponsor owns a distinct responsibility in the system. None of the integrations are decorative.</p>
          </div>
          <div className={styles.sponsorGrid}>
            {sponsors.map((sponsor, index) => (
              <article className={styles.sponsorCard} key={sponsor.name} data-tone={sponsor.tone}>
                <div className={styles.sponsorTop}><span>0{index + 1}</span><i /></div>
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
              Accessibility changes presentation, pacing, and support while the learning objective stays fixed.
            </p>
          </div>
          <div className={styles.principleList}>
            <div><span>01</span><p><strong>Evidence first</strong>Every room links to a graph path and classroom evidence.</p></div>
            <div><span>02</span><p><strong>Humans stay responsible</strong>Uncertain grades and final plans require educator approval.</p></div>
            <div><span>03</span><p><strong>Memory compounds</strong>Each assignment improves the model used for the next one.</p></div>
            <div><span>04</span><p><strong>Security runs quietly</strong>Snyk checks every code change outside the classroom runtime.</p></div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <span className={styles.ctaSpark}>✦</span>
          <p className={styles.kicker}>THE CLASSROOM IS READY</p>
          <h2>Watch one assignment rebuild the school.</h2>
          <p>
            Start with a synthetic Algebra I class, then follow every room,
            decision, and movement from upload to tomorrow&apos;s lesson plan.
          </p>
          <Link className={styles.ctaButton} href="/curriculum">
            Build a learning run <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark} aria-hidden="true">A</span><span>Atrium</span></Link>
        <p>A classroom with memory, in motion.</p>
        <div><span>Memory Meets Motion</span><span>San Francisco · 2026</span></div>
      </footer>
    </div>
  );
}
