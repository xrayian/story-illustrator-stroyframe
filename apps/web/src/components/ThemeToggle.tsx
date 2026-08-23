"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function writeTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next;
  try {
    localStorage.setItem("storyframe-theme", next);
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => {
        const dark = document.documentElement.classList.contains("dark");
        writeTheme(dark ? "light" : "dark");
      }}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-elev text-fg-muted transition hover:bg-surface hover:text-fg"
    >
      <Sun className="h-4 w-4 dark:hidden" aria-hidden />
      <Moon className="hidden h-4 w-4 dark:block" aria-hidden />
    </button>
  );
}
