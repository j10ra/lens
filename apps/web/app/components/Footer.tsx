import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-100">
              Product
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/docs"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  to="/#pricing"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-100">
              Community
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/j10ra/lens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-100">
              Account
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/login"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Login
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-100">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/privacy"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-500">
          &copy; {new Date().getFullYear()} LENS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
