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
          Last updated: February 10, 2026
        </p>

        <div className="mt-8 text-muted-foreground leading-relaxed">
          <p>
            These Terms of Service ("Terms") govern your use of the LENS CLI
            tool, cloud services, and website (collectively, the "Service")
            operated by LENS ("we", "us", "our"). By using the Service, you
            agree to these Terms.
          </p>
        </div>

        <Section title="Service Description">
          <p>
            LENS is a local-first codebase indexing engine. The core CLI and
            engine run entirely on your machine. The optional cloud tier provides
            AI proxy services (embedding generation, purpose summaries) and
            billing management.
          </p>
          <p>
            <strong className="text-foreground">Local components</strong> &mdash;
            The LENS engine, CLI, and daemon operate locally. Your source code
            never leaves your machine unless you explicitly opt into cloud
            features.
          </p>
          <p>
            <strong className="text-foreground">Cloud components</strong> &mdash;
            When enabled, the cloud tier proxies requests to third-party AI
            services (Voyage AI for embeddings, OpenRouter for purpose
            summaries). Only code snippets and metadata are transmitted, not full
            files.
          </p>
        </Section>

        <Section title="Account & Authentication">
          <p>
            Cloud features require a LENS account. You are responsible for
            maintaining the security of your authentication credentials and API
            keys. You must notify us immediately of any unauthorized access.
          </p>
          <p>
            You may not share API keys or allow multiple users to authenticate
            under a single account unless on a team plan.
          </p>
        </Section>

        <Section title="Acceptable Use">
          <p>You agree not to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Use the Service for any unlawful purpose or to violate any
              applicable laws
            </li>
            <li>
              Reverse-engineer, decompile, or disassemble the Service beyond
              what is permitted by applicable law
            </li>
            <li>
              Attempt to bypass rate limits, usage quotas, or authentication
              mechanisms
            </li>
            <li>
              Use automated systems to scrape, overload, or interfere with the
              Service
            </li>
            <li>
              Redistribute API keys or resell access to the Service without
              authorization
            </li>
          </ul>
        </Section>

        <Section title="API Usage & Rate Limits">
          <p>
            Each plan tier includes specific usage limits for embedding
            generation, purpose summaries, and API requests. Usage beyond these
            limits may result in throttled or blocked requests until the next
            billing cycle.
          </p>
          <p>
            We reserve the right to modify rate limits with 30 days notice. Free
            tier limits may be adjusted at any time.
          </p>
        </Section>

        <Section title="Data Handling">
          <p>
            <strong className="text-foreground">Local data.</strong> All indexed
            data, SQLite databases, and context packs remain on your machine. We
            have no access to locally stored data.
          </p>
          <p>
            <strong className="text-foreground">Cloud data.</strong> When using
            cloud features, code snippets are sent to third-party AI providers
            for processing. We do not store the content of these requests beyond
            transient processing. Usage metadata (request counts, timestamps) is
            retained for billing and diagnostics.
          </p>
        </Section>

        <Section title="Intellectual Property">
          <p>
            You retain all rights to your source code and repositories. LENS
            claims no ownership over any content you index or query.
          </p>
          <p>
            The LENS software, documentation, and branding are owned by us and
            protected by applicable intellectual property laws. The CLI is
            distributed under the terms of its open-source license.
          </p>
        </Section>

        <Section title="Payment & Billing">
          <p>
            Paid plans are billed monthly via Stripe. You authorize recurring
            charges to your payment method. You may cancel at any time; access
            continues through the end of the current billing period.
          </p>
          <p>
            Refunds are issued at our discretion for unused portions of the
            current billing period. Partial-month refunds are calculated
            pro-rata.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may terminate your account at any time by deleting it from the
            dashboard. We may suspend or terminate accounts that violate these
            Terms, with notice when practical.
          </p>
          <p>
            Upon termination, your cloud data (API keys, usage history) will be
            deleted within 30 days. Local data on your machine is unaffected.
          </p>
        </Section>

        <Section title="Limitation of Liability">
          <p>
            The Service is provided "as is" without warranties of any kind. To
            the maximum extent permitted by law, we are not liable for any
            indirect, incidental, special, or consequential damages arising from
            your use of the Service.
          </p>
          <p>
            Our total liability is limited to the amount you paid us in the 12
            months preceding the claim. Free tier users acknowledge the Service
            is provided without any liability.
          </p>
        </Section>

        <Section title="Changes to Terms">
          <p>
            We may update these Terms at any time. Material changes will be
            communicated via email or dashboard notification at least 14 days
            before taking effect. Continued use after changes constitutes
            acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For questions about these Terms, contact us at{" "}
            <a
              href="mailto:legal@lens.dev"
              className="text-primary hover:text-primary/80"
            >
              legal@lens.dev
            </a>
            .
          </p>
        </Section>
      </div>
    </PublicLayout>
  );
}
