import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Product
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/docs"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  to="/#pricing"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Account
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/login"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Login
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-foreground">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} LENS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
