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
      <div className="mt-4 space-y-3 text-zinc-400 leading-relaxed">
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
        <p className="mt-2 text-sm text-zinc-500">
          Last updated: February 10, 2026
        </p>

        <div className="mt-8 text-zinc-400 leading-relaxed">
          <p>
            LENS ("we", "us", "our") operates the lens.dev website and the LENS
            CLI tool. This policy describes how we collect, use, and protect your
            information.
          </p>
        </div>

        <Section title="Information We Collect">
          <p>
            <strong className="text-zinc-200">Account data.</strong> When you
            sign up, we collect your email address, name, and authentication
            provider profile (GitHub or Google). We do not store passwords.
          </p>
          <p>
            <strong className="text-zinc-200">Usage data.</strong> We log API
            request counts, embedding quotas, and error rates. We do not log
            your source code, repository contents, or context pack payloads.
          </p>
          <p>
            <strong className="text-zinc-200">Payment data.</strong> Billing
            information is processed and stored by Stripe. We never see or store
            your full card number.
          </p>
        </Section>

        <Section title="How We Use Information">
          <p>We use collected information to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Provide and maintain the LENS service</li>
            <li>Enforce usage quotas and rate limits</li>
            <li>Process payments and manage subscriptions</li>
            <li>Send transactional emails (receipts, security alerts)</li>
            <li>Diagnose technical issues and improve reliability</li>
          </ul>
          <p>We do not sell your data to third parties.</p>
        </Section>

        <Section title="Third-Party Services">
          <p>We use the following third-party services:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-zinc-200">Supabase</strong> &mdash;
              Authentication and database hosting
            </li>
            <li>
              <strong className="text-zinc-200">Stripe</strong> &mdash; Payment
              processing
            </li>
            <li>
              <strong className="text-zinc-200">Cloudflare</strong> &mdash; CDN,
              DDoS protection, Workers runtime
            </li>
            <li>
              <strong className="text-zinc-200">Sentry</strong> &mdash; Error
              tracking and performance monitoring
            </li>
            <li>
              <strong className="text-zinc-200">Voyage AI</strong> &mdash; Code
              embedding generation (text sent is code snippets only, not full
              files)
            </li>
          </ul>
          <p>
            Each provider processes data under their own privacy policies. We
            select providers that comply with industry-standard security
            practices.
          </p>
        </Section>

        <Section title="Data Retention">
          <p>
            Account data is retained while your account is active. Usage logs are
            retained for 90 days. You can request full deletion of your account
            and associated data at any time.
          </p>
        </Section>

        <Section title="Your Rights">
          <p>You have the right to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and data</li>
            <li>Export your data in a machine-readable format</li>
            <li>Withdraw consent for optional data processing</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            For privacy-related questions or data requests, contact us at{" "}
            <a
              href="mailto:privacy@lens.dev"
              className="text-blue-400 hover:text-blue-300"
            >
              privacy@lens.dev
            </a>
            .
          </p>
        </Section>
      </div>
    </PublicLayout>
  );
}
