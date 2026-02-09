import { Link } from "@tanstack/react-router";

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="text-blue-500">LENS</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/docs"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Docs
          </Link>
          <a
            href="https://github.com/j10ra/lens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            GitHub
          </a>
          <Link
            to="/login"
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            Login
          </Link>
        </div>
      </div>
    </nav>
  );
}
