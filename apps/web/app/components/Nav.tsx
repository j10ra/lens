import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sun, Moon } from "lucide-react";

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="text-primary">LENS</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <Link
              to="/docs"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Docs
            </Link>
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </div>
          <div className="h-4 w-px bg-border/70" />
          <div className="flex items-center gap-1.5">
            <a
              href="https://www.npmjs.com/package/lens-engine"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="npm package"
              className="inline-flex size-8 items-center justify-center rounded-lg text-[#CB3837] transition-colors hover:bg-accent"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-[18px]"
                fill="currentColor"
              >
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
            </a>
            <ThemeToggle />
          </div>
          <Link
            to="/docs"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
