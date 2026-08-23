import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-bg-elev">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="text-balance">
          <span className="font-display font-semibold text-fg">Storyframe</span> — paste a
          story, get an illustrated, narrated, redistributable bundle.
       </p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/stories" className="transition hover:text-fg">
            My Stories
         </Link>
          <Link href="/play" className="transition hover:text-fg">
            Open .svmp
         </Link>
          <Link
            href="https://github.com/xrayian/story-illustrator-stroyframe/blob/main/docs/svmp-format.md"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-fg"
          >
            Bundle format
         </Link>
       </nav>
     </div>
   </footer>
  );
}
