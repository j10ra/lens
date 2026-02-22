import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3 text-muted-foreground leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/70">
          Last updated: February 2026
        </p>

        <div className="mt-8 text-muted-foreground leading-relaxed">
          <p>
            LENS ("we", "us", "our") is an open-source project. This policy
            describes how we handle information related to the LENS website and
            CLI tool.
          </p>
        </div>

        <Section title="Local-First Design">
          <p>
            LENS runs entirely on your machine. Your source code, index data,
            and query results never leave your device. The CLI, daemon, and
            dashboard operate locally with no external network calls.
          </p>
          <p>
            All indexed data is stored in SQLite databases at{" "}
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground">
              ~/.lens/
            </code>
            . No data is transmitted to any server.
          </p>
        </Section>

        <Section title="Website Data">
          <p>
            <strong className="text-foreground">Analytics.</strong> The LENS
            website may use basic analytics (page views, referrers) to
            understand usage patterns. No personally identifiable information
            is collected.
          </p>
          <p>
            <strong className="text-foreground">Error tracking.</strong> We use
            Sentry for crash reporting on the website only. Error reports may
            include browser type, page URL, and stack traces. No source code or
            repository data is included.
          </p>
        </Section>

        <Section title="Third-Party Services">
          <p>The LENS website uses:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-foreground">Cloudflare</strong> &mdash;
              CDN and DDoS protection for the website
            </li>
            <li>
              <strong className="text-foreground">Sentry</strong> &mdash; Error
              tracking for the website frontend
            </li>
          </ul>
          <p>
            The LENS CLI and daemon make no external network requests. All
            processing happens locally.
          </p>
        </Section>

        <Section title="Your Rights">
          <p>
            Since LENS stores all data locally on your machine, you have full
            control over your data at all times. Delete{" "}
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground">
              ~/.lens/
            </code>{" "}
            to remove all indexed data. Uninstall the CLI to remove the tool
            entirely.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For privacy-related questions, contact us at{" "}
            <a
              href="mailto:hi@lens-engine.com"
              className="text-primary hover:text-primary/80"
            >
              hi@lens-engine.com
            </a>
            .
          </p>
        </Section>
      </div>
    </PublicLayout>
  );
}
