import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileAudio,
  Image as ImageIcon,
  Mic2,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { PasteForm } from "@/components/PasteForm";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI-analyzed structure",
    body:
      "Gemini extracts characters, scenes, and cues. Inferred demographics only land where the text supports them — never guessed from a name.",
  },
  {
    icon: Users,
    title: "Cast-review gate",
    body:
      "Nothing is generated until you approve the cast. Edit names, roles, and physical descriptions before voice or visual work begins.",
  },
  {
    icon: Mic2,
    title: "Per-character voices",
    body:
      "ElevenLabs Voice Design v3 gives each character and the narrator a distinct voice. Re-roll any voice; skip narration entirely if you prefer.",
  },
  {
    icon: ImageIcon,
    title: "Illustrated scenes",
    body:
      "Reference portraits re-anchor every scene illustration for visual consistency, with Gemini, Hugging Face, and Pollinations fallback for reliability.",
  },
] as const;

const STEPS = [
  {
    n: 1,
    title: "Paste your story",
    body:
      "Plain text — Wattpad exports, blog posts, manuscripts. A title and source URL are optional.",
  },
  {
    n: 2,
    title: "Review the cast",
    body:
      "Approve or edit each character's name, role, and description before any paid generation runs.",
  },
  {
    n: 3,
    title: "Cast voices and generate visuals",
    body:
      "Design voices for every character, then generate reference portraits and scene illustrations.",
  },
  {
    n: 4,
    title: "Play or download the .svmp",
    body:
      "Stream it from the web player, or download a single self-contained .svmp bundle that plays offline.",
  },
] as const;

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <CTAStart />
   </>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="gradient-hero absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div className="animate-fade-in">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev/80 px-3 py-1 text-xs font-medium text-fg-muted shadow-card backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            Open-source · story-to-audio-visual
        </span>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-fg text-balance sm:text-5xl lg:text-6xl">
            Turn a story into an{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              illustrated, narrated
           </span>{" "}
            bundle.
        </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-muted text-pretty sm:text-lg">
            Drop in your text. Approve the cast. Download an{" "}
            <code className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-fg">
              .svmp
           </code>{" "}
            you can play offline and redistribute — no platform lock-in.
        </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#start"
              className="group inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-lift transition hover:bg-primary-hover"
            >
              Start with a story
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
            <Link
              href="/stories"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-elev px-5 py-3 text-sm font-semibold text-fg shadow-card transition hover:bg-surface"
            >
              View my stories
          </Link>
        </div>
          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-muted">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              Self-contained bundle
          </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              Cast-review approval gate
          </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              Multi-provider image fallback
          </li>
        </ul>
      </div>

        <div className="relative animate-fade-in lg:pl-4">
          <StoryPreviewMock />
      </div>
    </div>
  </section>
  );
}

function StoryPreviewMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-accent/20 blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-lift">
        <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-indigo-500 via-violet-500 to-amber-400">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.45),transparent_60%)]" aria-hidden />
          <div className="absolute left-3 top-3 rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Scene 1 / 4
        </div>
          <div className="absolute bottom-4 left-1/2 w-[80%] -translate-x-1/2 rounded-lg bg-black/55 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              Narrator
          </span>
            The lantern hummed as the first stars appeared above the rooftops.
        </div>
      </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
              Now playing
          </p>
            <h3 className="mt-0.5 font-display text-lg font-semibold text-fg">
              The Paper Lantern
          </h3>
        </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-fg">
                <FileAudio className="h-3.5 w-3.5" aria-hidden />
            </span>
              <div className="flex flex-1 items-center gap-0.5">
                {Array.from({ length: 32 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-primary/60"
                    style={{ height: `${6 + Math.abs(Math.sin(i * 0.7)) * 18}px` }}
                  />
                ))}
            </div>
              <span className="font-mono text-xs tabular-nums text-fg-muted">02:14</span>
          </div>
        </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex -space-x-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-elev bg-gradient-to-br from-amber-300 to-amber-500 text-[10px] font-bold text-amber-900">
                M
            </span>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-elev bg-gradient-to-br from-sky-300 to-indigo-500 text-[10px] font-bold text-white">
                T
            </span>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-elev bg-gradient-to-br from-rose-300 to-rose-500 text-[10px] font-bold text-white">
                N
            </span>
          </div>
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Wand2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              3 voices · 4 scenes
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="border-t border-border bg-bg-elev py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            What&apos;s inside
        </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl text-balance">
            Everything a narrated bundle needs, end to end.
        </h2>
          <p className="mt-3 text-fg-muted text-pretty">
            No half-baked steps. Each phase is gated, observable, and recoverable.
        </p>
      </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="group rounded-2xl border border-border bg-bg p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-fg">
                <Icon className="h-5 w-5" aria-hidden />
            </span>
              <h3 className="mt-4 font-display text-base font-semibold text-fg">
                {title}
            </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{body}</p>
          </article>
          ))}
      </div>
    </div>
  </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            How it works
        </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl text-balance">
            Four phases. One bundle.
        </h2>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="relative rounded-2xl border border-border bg-bg p-5 shadow-card"
            >
              <span
                aria-hidden
                className="absolute -top-3 left-5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-fg shadow-card"
              >
                {step.n}
            </span>
              <h3 className="mt-2 font-display text-base font-semibold text-fg">
                {step.title}
            </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{step.body}</p>
          </li>
          ))}
      </ol>
    </div>
  </section>
  );
}

function CTAStart() {
  return (
    <section id="start" className="border-t border-border bg-bg-elev py-20">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl border border-border bg-bg p-6 shadow-card sm:p-10">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Try it now
          </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl text-balance">
              Paste a story and watch the pipeline build it.
          </h2>
            <p className="mt-2 text-sm text-fg-muted text-pretty">
              You&apos;ll review and approve the cast before any paid generation runs.
           </p>
        </div>
          <PasteForm />
      </div>
    </div>
  </section>
  );
}
