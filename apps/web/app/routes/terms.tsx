import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
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

function TermsPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/70">
          Last updated: February 2026
        </p>

        <div className="mt-8 text-muted-foreground leading-relaxed">
          <p>
            These Terms of Service ("Terms") govern your use of the LENS CLI
            tool, website, and associated software (collectively, the
            "Software") distributed under the MIT License.
          </p>
        </div>

        <Section title="Software Description">
          <p>
            LENS is an open-source, local-first code intelligence engine. The
            CLI, daemon, and dashboard run entirely on your machine. Your
            source code never leaves your device.
          </p>
          <p>
            LENS provides code indexing, ranked search (TF-IDF + import graph +
            co-change analysis), dependency graph visualization, and MCP tool
            integration for AI coding agents.
          </p>
        </Section>

        <Section title="Open Source License">
          <p>
            LENS is distributed under the MIT License. You are free to use,
            copy, modify, merge, publish, distribute, sublicense, and/or sell
            copies of the Software, subject to the conditions of the MIT
            License.
          </p>
          <p>
            The full license text is available in the{" "}
            <a
              href="https://github.com/j10ra/lens/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80"
            >
              LICENSE
            </a>{" "}
            file on GitHub.
          </p>
        </Section>

        <Section title="Acceptable Use">
          <p>You agree not to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Use the Software for any unlawful purpose or to violate any
              applicable laws
            </li>
            <li>
              Misrepresent the origin of the Software or claim authorship of
              the original work
            </li>
            <li>
              Remove or alter any copyright, license, or attribution notices
            </li>
          </ul>
        </Section>

        <Section title="Data Handling">
          <p>
            <strong className="text-foreground">All data stays local.</strong>{" "}
            LENS indexes your codebase on your machine. All SQLite databases,
            traces, and query results are stored at{" "}
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground">
              ~/.lens/
            </code>
            . No data is transmitted to any external server.
          </p>
          <p>
            You retain all rights to your source code and repositories. LENS
            claims no ownership over any content you index or query.
          </p>
        </Section>

        <Section title="Disclaimer of Warranties">
          <p>
            The Software is provided "as is" without warranties of any kind,
            express or implied, including but not limited to the warranties of
            merchantability, fitness for a particular purpose, and
            noninfringement. See the MIT License for full details.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            In no event shall the authors or copyright holders be liable for
            any claim, damages, or other liability arising from the use of the
            Software, whether in an action of contract, tort, or otherwise.
          </p>
        </Section>

        <Section title="Changes to Terms">
          <p>
            We may update these Terms at any time. Changes will be posted on
            this page with an updated date. Continued use after changes
            constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For questions about these Terms, contact us at{" "}
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
