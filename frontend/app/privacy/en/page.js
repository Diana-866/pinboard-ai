export default function PrivacyPageEn() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="mb-6 text-sm">
        <a href="/privacy" className="text-accent underline">Читать на русском</a>
      </p>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mb-8 text-sm text-ink-soft">Last updated: September 23, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>This Privacy Policy describes what information PinSprig (the "Service", "we") collects and processes when you (the "User", "you") use the Service, available at pinboard-ai-web.vercel.app.</p>

        <h2 className="text-lg font-medium text-ink">1. Scope of this document</h2>
        <p>The Service is available to users worldwide. This Policy applies to all users regardless of country of residence, with additional provisions for users in the European Union (Section 9) and the State of California, USA (Section 10).</p>
        <p>Legal basis for processing (EU/EEA users): performance of a contract; your consent when connecting Pinterest or using optional features; legitimate interest for security purposes.</p>

        <h2 className="text-lg font-medium text-ink">2. What information we collect</h2>
        <p><strong>Information you provide:</strong> email and encrypted password on registration; project information (website link, niche, language, goals, tone); payment information when purchasing a subscription or credits.</p>
        <p><strong>Pinterest connection data:</strong> read-only access via the official Pinterest API when you voluntarily connect your account. We do not store this data — it is requested fresh with each access.</p>
        <p><strong>Technical data:</strong> standard logs (IP address, browser type) temporarily retained by our hosting provider for security. We do not use analytics, tracking, advertising, or remarketing.</p>

        <h2 className="text-lg font-medium text-ink">3. How we use your information</h2>
        <p>To provide Service features, process payments, respond to support requests, and maintain security. We do not sell or share your data for marketing purposes.</p>

        <h2 className="text-lg font-medium text-ink">4. Sharing data with third parties</h2>
        <p>Hosting and database provider; AI content generation provider (request text is sent to generate pins, images are stored temporarily, up to 48 hours); payment processor (processes card data directly, we do not store it); Pinterest, only when you voluntarily connect your account.</p>

        <h2 className="text-lg font-medium text-ink">5. Payments</h2>
        <p>Payments are processed by a third-party payment provider. We do not store your full card details.</p>

        <h2 className="text-lg font-medium text-ink">6. Data retention and deletion</h2>
        <p>Data is retained while your account is active. Deletion requests via Section 8 contacts are processed within a reasonable time, except where the law requires otherwise.</p>

        <h2 className="text-lg font-medium text-ink">7. Your rights</h2>
        <p>Request a copy of your data; correct inaccurate data; delete your account; revoke Pinterest access at any time; withdraw consent to processing.</p>

        <h2 className="text-lg font-medium text-ink">8. Children</h2>
        <p>The Service is not intended for individuals under the age of 18.</p>

        <h2 className="text-lg font-medium text-ink">9. Additional provisions for EU/EEA users (GDPR)</h2>
        <p>Right to data portability, right to restrict processing, right to object, right to lodge a complaint with a supervisory authority. International transfers: some providers may be located outside the EEA, including Russia, based on your consent and contract necessity.</p>

        <h2 className="text-lg font-medium text-ink">10. Additional provisions for California residents (CCPA/CPRA)</h2>
        <p>Right to know what categories of data we collect, right to deletion, right to non-discrimination. We do not sell personal information.</p>

        <h2 className="text-lg font-medium text-ink">11. Cookies</h2>
        <p>Only technically necessary cookies to maintain your login session — not for advertising or analytics.</p>

        <h2 className="text-lg font-medium text-ink">12. Contact us</h2>
        <p>For questions about this policy: pinsprig.support@gmail.com</p>

        <h2 className="text-lg font-medium text-ink">13. Changes to this policy</h2>
        <p>We may update this document as the Service evolves. Material changes will be communicated via a notice within the Service.</p>
      </div>
    </div>
  );
}