import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => seoHead(SEO.privacy),
  component: PrivacyPage,
});

function PrivacyPage() {
  const lastUpdated = "30 July 2026";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <AppHeader active="privacy" />

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-16">
        <div className="mx-auto max-w-3xl">
          {/* Hero */}
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-gray-500">
              Last updated: {lastUpdated}
            </p>
          </div>

          {/* Policy Content */}
          <div className="prose prose-amber max-w-none space-y-10 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-8 shadow-sm sm:p-12">
            {/* 1. Introduction */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">1. Introduction</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                Welcome to Pawls ("we," "our," or "us"). We are committed to protecting your
                personal data and respecting your privacy. This Privacy Policy explains how we
                collect, use, disclose, and safeguard your information when you use our website
                (<a href="https://pawls.club" className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]">pawls.club</a>),
                mobile application, and related services (collectively, the "Service").
              </p>
              <p className="mt-3 leading-relaxed text-gray-700">
                By using the Service, you agree to the collection and use of information in
                accordance with this policy. If you do not agree with this policy, please do not
                use our Service.
              </p>
            </section>

            {/* 2. Data We Collect */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">2. Information We Collect</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We collect several types of information to provide and improve our Service:
              </p>
              <h3 className="mt-4 font-semibold text-gray-900">2.1 Information You Provide</h3>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Account Information:</strong> When you register, we collect your email
                  address, name, and password.
                </li>
                <li>
                  <strong>Dog Profile Information:</strong> Your dog's name, breed, age, size,
                  temperament, energy level, photos, and other characteristics you choose to share.
                </li>
                <li>
                  <strong>Location Data:</strong> Your approximate or precise location to enable
                  nearby matching, venue discovery, and service booking. You can control location
                  permissions through your device settings.
                </li>
                <li>
                  <strong>Communication Data:</strong> Messages sent between users through our
                  platform, and any communications you send to our support team.
                </li>
                <li>
                  <strong>Payment Information:</strong> When you subscribe to Pawls Plus or pay for
                  services, we process payment details through Stripe. We do not store full credit
                  card numbers on our servers.
                </li>
              </ul>
              <h3 className="mt-4 font-semibold text-gray-900">2.2 Information Collected Automatically</h3>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Usage Data:</strong> Pages visited, features used, time spent, and
                  interactions within the app.
                </li>
                <li>
                  <strong>Device Information:</strong> Device type, operating system, browser type,
                  IP address, and unique device identifiers.
                </li>
                <li>
                  <strong>Cookies & Local Storage:</strong> We use cookies and browser local storage
                  to remember your preferences, maintain your session, and improve your experience.
                  See Section 6 for more details.
                </li>
                <li>
                  <strong>Product analytics:</strong> We use PostHog to understand aggregate product
                  usage and improve the Service. Pawls is configured for cookie-less analytics with
                  in-memory persistence where supported; we do not send personally identifiable
                  information in analytics event properties.
                </li>
              </ul>
            </section>

            {/* 3. How We Use Your Data */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">3. How We Use Your Information</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We use the information we collect for the following purposes:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Matching:</strong> To find compatible playmates for your dog based on
                  temperament, size, energy level, and location.
                </li>
                <li>
                  <strong>Service Booking:</strong> To connect you with dog walkers, groomers,
                  sitters, trainers, and veterinarians, and to process bookings and payments.
                </li>
                <li>
                  <strong>Breeder & Rescue Connections:</strong> To facilitate connections between
                  dog owners, ethical breeders, and rescue organizations.
                </li>
                <li>
                  <strong>Platform Improvement:</strong> To analyze usage patterns, diagnose
                  technical issues, and improve the Service.
                </li>
                <li>
                  <strong>Communication:</strong> To send you service-related notifications, updates,
                  and marketing communications (with your consent where required).
                </li>
                <li>
                  <strong>Security & Compliance:</strong> To detect and prevent fraud, abuse, and
                  violations of our Terms of Service, and to comply with legal obligations.
                </li>
              </ul>
            </section>

            {/* 4. Legal Basis (GDPR) */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">4. Legal Basis for Processing (GDPR)</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                If you are located in the European Economic Area (EEA) or the United Kingdom, our
                legal basis for collecting and using your personal data depends on the specific
                context in which we collect it. We process your data under the following legal bases:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Contractual Necessity:</strong> Processing is necessary to perform our
                  contract with you (e.g., providing matching, booking services).
                </li>
                <li>
                  <strong>Legitimate Interests:</strong> Processing is necessary for our legitimate
                  interests, such as improving our Service, preventing fraud, and marketing our
                  products, provided these interests are not overridden by your rights.
                </li>
                <li>
                  <strong>Consent:</strong> Where you have given us explicit consent to process your
                  data for a specific purpose (e.g., location data for nearby matching, marketing
                  emails). You may withdraw consent at any time.
                </li>
                <li>
                  <strong>Legal Obligation:</strong> Processing is necessary to comply with a legal
                  obligation to which we are subject.
                </li>
              </ul>
            </section>

            {/* 5. Third-Party Services */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">5. Third-Party Services</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We share your data with the following third-party service providers who help us
                operate our Service:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Stripe:</strong> We use Stripe to process payments. When you make a
                  payment, Stripe collects and processes your payment card details in accordance
                  with its{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                  >
                    Privacy Policy
                  </a>
                  . We do not store full payment card details on our servers.
                </li>
                <li>
                  <strong>Neon:</strong> We use Neon (a serverless PostgreSQL provider) to store
                  and manage our database. Your data is stored on Neon's secure infrastructure in
                  accordance with their{" "}
                  <a
                    href="https://neon.tech/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                  >
                    Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Analytics Providers:</strong> We may use analytics services to understand
                  how users interact with our Service. These providers may collect usage data and
                  device information.
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-gray-700">
                We do not sell, rent, or trade your personal data to third parties for their
                marketing purposes.
              </p>
            </section>

            {/* 6. Cookies & Local Storage */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">6. Cookies & Local Storage</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We use cookies and browser local storage to enhance your experience on Pawls:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Essential Cookies:</strong> Required for the Service to function properly,
                  including maintaining your session and authentication state.
                </li>
                <li>
                  <strong>Preference Cookies:</strong> Remember your settings and preferences (e.g.,
                  language, theme) across visits.
                </li>
                <li>
                  <strong>Local Storage:</strong> We store non-sensitive user preferences (such as
                  profile data and UI state) in your browser's local storage for faster load times
                  and offline functionality.
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-gray-700">
                You can control cookies through your browser settings. Please note that disabling
                essential cookies may affect the functionality of the Service.
              </p>
            </section>

            {/* 7. Data Retention */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">7. Data Retention</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We retain your personal data only for as long as necessary to fulfill the purposes
                outlined in this policy, or as required by law. When you delete your account, we
                will delete or anonymize your personal data within 30 days, except where retention
                is required for legal, accounting, or fraud prevention purposes.
              </p>
            </section>

            {/* 8. Data Security */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">8. Data Security</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We implement appropriate technical and organizational measures to protect your
                personal data against unauthorized access, alteration, disclosure, or destruction.
                These measures include encryption in transit (TLS), encrypted database storage,
                access controls, and regular security reviews. However, no method of transmission
                over the Internet or electronic storage is 100% secure, and we cannot guarantee
                absolute security.
              </p>
            </section>

            {/* 9. Your Rights */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">9. Your Rights</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                Depending on your jurisdiction, you may have the following rights regarding your
                personal data:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-gray-700">
                <li>
                  <strong>Right of Access:</strong> You can request a copy of the personal data we
                  hold about you.
                </li>
                <li>
                  <strong>Right to Rectification:</strong> You can request that we correct any
                  inaccurate or incomplete data.
                </li>
                <li>
                  <strong>Right to Erasure:</strong> You can request that we delete your personal
                  data ("right to be forgotten").
                </li>
                <li>
                  <strong>Right to Restrict Processing:</strong> You can request that we limit how
                  we use your data.
                </li>
                <li>
                  <strong>Right to Data Portability:</strong> You can request a copy of your data in
                  a structured, machine-readable format.
                </li>
                <li>
                  <strong>Right to Object:</strong> You can object to our processing of your data,
                  including for direct marketing purposes.
                </li>
                <li>
                  <strong>Right to Withdraw Consent:</strong> Where processing is based on consent,
                  you can withdraw it at any time without affecting the lawfulness of prior
                  processing.
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-gray-700">
                To exercise any of these rights, please contact us at{" "}
                <a
                  href="mailto:privacy@pawls.club"
                  className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                >
                  privacy@pawls.club
                </a>
                . We will respond to your request within 30 days. You also have the right to lodge a
                complaint with your local data protection supervisory authority.
              </p>
            </section>

            {/* 10. Children's Privacy */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">10. Children's Privacy</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                Our Service is not directed to individuals under the age of 16. We do not knowingly
                collect personal data from children. If you are a parent or guardian and believe
                your child has provided us with personal data, please contact us immediately at{" "}
                <a
                  href="mailto:privacy@pawls.club"
                  className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                >
                  privacy@pawls.club
                </a>
                .
              </p>
            </section>

            {/* 11. International Data Transfers */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">11. International Data Transfers</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                Your data may be transferred to and processed in countries outside your country of
                residence, including countries that may have different data protection laws. We
                ensure that appropriate safeguards are in place for such transfers, including
                Standard Contractual Clauses approved by the European Commission where applicable.
              </p>
            </section>

            {/* 12. Changes to This Policy */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">12. Changes to This Policy</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                We may update this Privacy Policy from time to time. We will notify you of any
                material changes by posting the new policy on this page and updating the "Last
                updated" date. We encourage you to review this policy periodically.
              </p>
            </section>

            {/* 13. Contact Us */}
            <section>
              <h2 className="text-xl font-bold text-[var(--pawls-terracotta-500)]">13. Contact Us</h2>
              <p className="mt-3 leading-relaxed text-gray-700">
                If you have any questions, concerns, or requests regarding this Privacy Policy or
                our data practices, please contact us:
              </p>
              <p className="mt-3 text-gray-700"><Link to="/settings" className="text-[var(--pawls-terracotta-500)] underline">Delete your account from Settings</Link> · <Link to="/terms" className="text-[var(--pawls-terracotta-500)] underline">Read our Terms of Service</Link></p>
              <ul className="mt-2 list-none space-y-1 text-gray-700">
                <li>
                   Email:{" "}
                  <a
                    href="mailto:privacy@pawls.club"
                    className="text-[var(--pawls-terracotta-500)] underline hover:text-[var(--pawls-terracotta-700)]"
                  >
                    privacy@pawls.club
                  </a>
                </li>
                <li> Website: https://pawls.club</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <AppFooter />
    </div>
  );
}
