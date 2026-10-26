"use client";

import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import Access from "./access";
import styles from "./dashboard.module.css";

type DashboardProps = {
  name: string;
  hasPasskeys: boolean;
  expiresAt: number;
};

type ToolId = "money" | "work" | "health" | "habits" | "planning" | "week";

type IconName = ToolId | "spark" | "settings" | "arrow" | "search";

type Feedback = {
  title: string;
  description: string;
};

type Tool = {
  id: ToolId;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
};

const tools: Tool[] = [
  {
    id: "money",
    title: "Geld",
    subtitle: "Meer grip, minder gokwerk.",
    description:
      "Je inkomsten, uitgaven en plannen samen. Zo kun je rekening houden met wat er nog moet gebeuren vóór je volgende inkomen.",
    features: [
      "Uitgaven en inkomsten",
      "Maandbudget",
      "Abonnementen en vaste kosten",
      "Spaardoelen",
      "Kan ik dit uitgeven?",
    ],
  },
  {
    id: "work",
    title: "Werk",
    subtitle: "Jouw tijd telt.",
    description:
      "Een plek voor je werkuren en een schatting van wat je verdient.",
    features: [
      "Werkuren en pauzes",
      "Overzicht per week en maand",
      "Geschat loon",
    ],
  },
  {
    id: "health",
    title: "Gezondheid",
    subtitle: "Kleine stappen voor jezelf.",
    description: "Je beweging, voeding en waterinname bij elkaar.",
    features: ["Workoutplanner", "Calorieën bijhouden", "Waterinname"],
  },
  {
    id: "habits",
    title: "Gewoontes",
    subtitle: "Op jouw ritme.",
    description: "Zelfgekozen gewoontes met dagen en doelen die bij je passen.",
    features: [
      "Dagelijkse en wekelijkse gewoontes",
      "Afvinken per dag",
      "Voortgang per week",
    ],
  },
  {
    id: "planning",
    title: "Planning",
    subtitle: "Ruimte in je hoofd.",
    description:
      "Een plek voor wat je wilt onthouden en wanneer je eraan herinnerd wilt worden.",
    features: [
      "Herinneringen",
      "Eenmalige en terugkerende taken",
      "Overzicht van vandaag",
    ],
  },
  {
    id: "week",
    title: "Deze week",
    subtitle: "Alles even op een rij.",
    description:
      "Je geld, werk, gezondheid en gewoontes samengebracht in één weekoverzicht.",
    features: [
      "Inkomsten, uitgaven en sparen",
      "Werkuren en geschat loon",
      "Workouts, water en calorieën",
      "Geplande en behaalde gewoontes",
    ],
  },
];

const suggestions = [
  "Kan ik €50 uitgeven?",
  "Open spaardoelen",
  "500 ml water",
  "Deze week",
];

const iconPaths: Record<IconName, string> = {
  money:
    "M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v9a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V7 M20 12h-5v4h5 M16 14h.01",
  work: "M8 6V4h8v2 M4 7h16v13H4z M4 11c5 4 11 4 16 0 M10 12h4",
  health:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  habits: "M9 5h11 M9 12h11 M9 19h11 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2",
  planning: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2",
  week: "M4 20h17 M6 16v-5 M12 16V5 M18 16V8",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 1000);

  function refreshWhenVisible() {
    if (document.visibilityState === "visible") {
      onChange();
    }
  }

  document.addEventListener("visibilitychange", refreshWhenVisible);
  window.addEventListener("pageshow", onChange);
  window.addEventListener("focus", onChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refreshWhenVisible);
    window.removeEventListener("pageshow", onChange);
    window.removeEventListener("focus", onChange);
  };
}

function getClockSnapshot() {
  return Math.floor(Date.now() / 60_000);
}

function getServerClockSnapshot() {
  return 0;
}

function getGreeting(hour: number) {
  if (hour >= 6 && hour < 12) {
    return "Goeiemorgen";
  }

  if (hour >= 12 && hour < 18) {
    return "Goeiemiddag";
  }

  return "Goeieavond";
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("nl-BE")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,]+$/, "");
}

function findDestination(value: string): ToolId | null {
  const command = value.replace(/^(?:open|toon|bekijk|ga naar)\s+/, "");

  const destinations: Record<string, ToolId> = {
    geld: "money",
    budget: "money",
    maandbudget: "money",
    budgetplanner: "money",
    uitgaven: "money",
    inkomsten: "money",
    abonnementen: "money",
    "vaste kosten": "money",
    spaardoelen: "money",
    sparen: "money",
    werk: "work",
    werkuren: "work",
    uren: "work",
    loon: "work",
    gezondheid: "health",
    fitness: "health",
    workouts: "health",
    calorieën: "health",
    calorieen: "health",
    water: "health",
    gewoontes: "habits",
    gewoonten: "habits",
    planning: "planning",
    herinneringen: "planning",
    week: "week",
    "deze week": "week",
    weekoverzicht: "week",
  };

  return Object.prototype.hasOwnProperty.call(destinations, command)
    ? destinations[command]
    : null;
}

export default function Dashboard({
  name,
  hasPasskeys,
  expiresAt,
}: DashboardProps) {
  const minute = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );

  const [query, setQuery] = useState("");
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const now = minute === 0 ? null : new Date(minute * 60_000);

  const greeting = now ? getGreeting(now.getHours()) : "Welkom terug";

  const dateLabel = now
    ? new Intl.DateTimeFormat("nl-BE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(now)
    : "Jouw dag, op één plek.";

  const selectedTool = tools.find((tool) => tool.id === activeTool);

  function openTool(id: ToolId) {
    setActiveTool(id);
    setFeedback(null);
  }

  function runCommand(input: string) {
    const command = normalize(input);

    if (!command) {
      return;
    }

    const destination = findDestination(command);

    if (destination) {
      openTool(destination);
      return;
    }

    if (command === "instellingen" || command === "open instellingen") {
      setSettingsOpen(true);
      setFeedback(null);
      return;
    }

    const spendingMatch = command.match(
      /^(?:kan ik|mag ik)\s+€?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur|€)?\s+uitgeven$/,
    );

    if (spendingMatch) {
      const amount = Number(spendingMatch[1].replace(",", "."));

      if (!Number.isFinite(amount) || amount <= 0) {
        setFeedback({
          title: "Welk bedrag wil je uitgeven?",
          description:
            "Gebruik een bedrag groter dan nul, bijvoorbeeld: kan ik €50 uitgeven?",
        });
        return;
      }

      const formatted = new Intl.NumberFormat("nl-BE", {
        style: "currency",
        currency: "EUR",
      }).format(amount);

      setActiveTool("money");
      setFeedback({
        title: `Past ${formatted} binnen je budget?`,
        description:
          "Dat kan ik nog niet betrouwbaar bepalen. Er is nog geen budget gekoppeld met je actuele saldo, volgende inkomen, resterende vaste kosten en benodigde leefgeld.",
      });

      return;
    }

    const waterMatch = command.match(
      /^(?:water\s+)?(\d+(?:[.,]\d{1,3})?)\s*(ml|l|liter)(?:\s+water)?$/,
    );

    if (waterMatch) {
      const amount = Number(waterMatch[1].replace(",", "."));

      if (!Number.isFinite(amount) || amount <= 0) {
        setFeedback({
          title: "Hoeveel water?",
          description:
            "Gebruik een hoeveelheid groter dan nul, bijvoorbeeld: 500 ml water.",
        });
        return;
      }

      setActiveTool("health");
      setFeedback({
        title: "Waterinname herkend",
        description:
          "Dit hoort bij je watertracker. De registratie is nog niet aangesloten, dus er is niets opgeslagen.",
      });

      return;
    }

    setFeedback({
      title: "Wat wil je doen?",
      description:
        "Probeer ‘open spaardoelen’, ‘open gewoontes’, ‘deze week’ of ‘kan ik €50 uitgeven?’. Je kunt ook hieronder een onderdeel kiezen.",
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand(query);
  }

  const visibleSuggestions = suggestions.filter((suggestion) => {
    const search = normalize(query);
    return !search || normalize(suggestion).includes(search);
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Daykit startpagina">
          <span className={styles.mark} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>daykit</span>
        </a>

        <button
          type="button"
          className={styles.iconButton}
          aria-label={
            settingsOpen ? "Instellingen sluiten" : "Instellingen openen"
          }
          aria-expanded={settingsOpen}
          aria-controls="dashboard-settings"
          onClick={() => {
            setSettingsOpen((value) => !value);
          }}
        >
          <Icon name="settings" />
        </button>
      </header>

      <div className={styles.commandArea}>
        <form
          className={styles.commandBox}
          onSubmit={handleSubmit}
          role="search"
          aria-label="Daykit besturen"
        >
          <span className={styles.commandIcon}>
            <Icon name="spark" />
          </span>

          <label className={styles.srOnly} htmlFor="daykit-command">
            Vraag iets of open een onderdeel
          </label>

          <input
            id="daykit-command"
            className={styles.commandInput}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFeedback(null);
            }}
            placeholder="Wat wil je doen?"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={250}
          />

          <button
            type="submit"
            className={styles.sendButton}
            disabled={!query.trim()}
            aria-label="Vraag uitvoeren"
          >
            <Icon name="arrow" size={20} />
          </button>
        </form>
      </div>

      <div className={styles.suggestions}>
        {visibleSuggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={styles.chip}
            onClick={() => {
              setQuery(suggestion);
              runCommand(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {feedback && (
        <section
          className={`${styles.glass} ${styles.answer}`}
          role="status"
          aria-live="polite"
        >
          <div className={styles.answerHeading}>
            <Icon name="spark" size={19} />
            <h2>{feedback.title}</h2>
          </div>
          <p>{feedback.description}</p>
        </section>
      )}

      <section
        id="dashboard-settings"
        className={styles.settingsPanel}
        hidden={!settingsOpen}
        aria-label="Instellingen"
      >
        <div className={styles.sectionHeading}>
          <h2>Instellingen</h2>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setSettingsOpen(false)}
          >
            Sluiten
          </button>
        </div>

        <Access
          mode="settings"
          hasPasskeys={hasPasskeys}
          expiresAt={expiresAt}
        />
      </section>

      <section className={styles.greeting} aria-labelledby="dashboard-title">
        <p className={styles.date}>{dateLabel}</p>
        <h1 id="dashboard-title">
          {greeting},
          <br />
          <span>{name}.</span>
        </h1>
        <p className={styles.greetingNote}>
          Een beetje overzicht. Meer ruimte voor je dag.
        </p>
      </section>

      <section aria-labelledby="today-title">
        <div className={styles.sectionHeading}>
          <h2 id="today-title">Vandaag</h2>
          <span className={styles.sectionNote}>Jouw overzicht</span>
        </div>

        <div className={styles.todayGrid}>
          <button
            type="button"
            className={`${styles.glass} ${styles.todayCard}`}
            onClick={() => openTool("money")}
            aria-expanded={activeTool === "money"}
            aria-controls="tool-detail"
          >
            <span className={styles.cardTop}>
              <Icon name="money" size={20} />
              <span>Vrij te besteden</span>
            </span>
            <strong>Nog geen budget</strong>
            <span className={styles.cardNote}>Eerst je financiële basis.</span>
          </button>

          <button
            type="button"
            className={`${styles.glass} ${styles.todayCard}`}
            onClick={() => openTool("habits")}
            aria-expanded={activeTool === "habits"}
            aria-controls="tool-detail"
          >
            <span className={styles.cardTop}>
              <Icon name="habits" size={20} />
              <span>Jouw ritme</span>
            </span>
            <strong>Een frisse start</strong>
            <span className={styles.cardNote}>Ruimte voor je gewoontes.</span>
          </button>
        </div>
      </section>

      <section className={styles.toolsSection} aria-labelledby="tools-title">
        <div className={styles.sectionHeading}>
          <h2 id="tools-title">Jouw tools</h2>
          <span className={styles.sectionNote}>Alles op één plek</span>
        </div>

        <div className={styles.toolGrid}>
          {tools
            .filter((tool) => tool.id !== "week")
            .map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`${styles.glass} ${styles.toolCard}`}
                data-active={activeTool === tool.id}
                aria-expanded={activeTool === tool.id}
                aria-controls="tool-detail"
                onClick={() => {
                  setFeedback(null);
                  setActiveTool((current) =>
                    current === tool.id ? null : tool.id,
                  );
                }}
              >
                <span className={styles.toolIcon}>
                  <Icon name={tool.id} />
                </span>
                <span className={styles.toolText}>
                  <strong>{tool.title}</strong>
                  <span>{tool.subtitle}</span>
                </span>
                <span className={styles.toolArrow}>
                  <Icon name="arrow" size={18} />
                </span>
              </button>
            ))}
        </div>

        <section
          id="tool-detail"
          className={`${styles.glass} ${styles.toolDetail}`}
          hidden={!selectedTool}
          aria-label={
            selectedTool ? `${selectedTool.title} overzicht` : "Onderdeel"
          }
        >
          {selectedTool && (
            <>
              <div className={styles.sectionHeading}>
                <h2>{selectedTool.title}</h2>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setActiveTool(null)}
                >
                  Sluiten
                </button>
              </div>

              <p>{selectedTool.description}</p>

              <ul className={styles.featureList}>
                {selectedTool.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <p className={styles.emptyNote}>
                Je hebt hier nog geen gegevens.
              </p>
            </>
          )}
        </section>
      </section>

      <section className={styles.weekSection} aria-labelledby="week-title">
        <button
          type="button"
          className={`${styles.glass} ${styles.weekCard}`}
          onClick={() => openTool("week")}
          aria-expanded={activeTool === "week"}
          aria-controls="tool-detail"
        >
          <span className={styles.weekHeading}>
            <span className={styles.toolIcon}>
              <Icon name="week" />
            </span>
            <span>
              <strong id="week-title">Deze week</strong>
              <span>Even alles op een rij.</span>
            </span>
            <span className={styles.weekArrow}>
              <Icon name="arrow" size={20} />
            </span>
          </span>

          <span className={styles.weekDescription}>
            Je geld, werk, gezondheid en gewoontes. Je overzicht groeit mee met
            wat je bijhoudt.
          </span>

          <span className={styles.weekTags}>
            <span>Geld</span>
            <span>Werk</span>
            <span>Gezondheid</span>
            <span>Gewoontes</span>
          </span>
        </button>
      </section>

      <p className={styles.footer}>Op jouw tempo.</p>
    </main>
  );
}
