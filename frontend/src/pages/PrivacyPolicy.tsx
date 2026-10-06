import React from 'react';
import { Link } from 'react-router-dom';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-page px-4 py-12">
      <div className="max-w-3xl mx-auto bg-surface border border-subtle rounded-2xl p-8 md:p-12">
        <Link to="/" className="text-sm text-accent mb-6 inline-block">← Back</Link>
        <h1 className="text-3xl font-semibold text-primary-theme font-['Outfit'] mb-2">Privacy Policy</h1>
        <p className="text-sm text-secondary-theme mb-8">Last updated: [UPDATE DATE WHEN PUBLISHED]</p>

        <p className="text-sm text-secondary-theme mb-6">
          This Privacy Policy describes what information PinSprig ("the Service," "we") collects and processes
          when you ("User," "you") use the Service, available at [YOUR FINAL DOMAIN — currently
          pinboard-ai-web.vercel.app, update once a permanent domain is purchased].
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">1. Information We Collect</h2>

        <h3 className="text-base font-semibold text-primary-theme mt-4 mb-2">1.1 Information you provide directly</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li>Email address and password (encrypted) — upon registration.</li>
          <li>Project information: website URL, niche, content language, promotion goals, tone and style preferences — when you create a project in the Service.</li>
          <li>Payment information — when you subscribe to a plan or purchase credits (see Section 4).</li>
        </ul>

        <h3 className="text-base font-semibold text-primary-theme mt-4 mb-2">1.2 Information obtained through Pinterest</h3>
        <p className="text-sm text-secondary-theme mb-2">
          When you voluntarily connect your Pinterest account, we request access through the official Pinterest API to:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-2">
          <li><strong>Read</strong> your boards and pins, to analyze your existing content and performance;</li>
          <li><strong>Create and publish</strong> boards and pins on your behalf, at your direction, as part of the Service's core content-generation and scheduling features.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-4">
          We store the Pinterest board and pin data necessary to provide these features — including historical
          snapshots used to track changes in your account and in publicly visible competitor accounts over time
          (see Section 1.4). This data is stored in our database for as long as your account remains active, or
          until you disconnect your Pinterest account or delete your account.
        </p>

        <h3 className="text-base font-semibold text-primary-theme mt-4 mb-2">1.3 Technical data</h3>
        <p className="text-sm text-secondary-theme mb-4">
          Standard technical logs (IP address, browser type, request time) may be temporarily retained by our
          hosting provider for security and troubleshooting purposes. We do not use analytics or tracking services
          (such as Google Analytics), do not show advertising, and do not use remarketing.
        </p>

        <h3 className="text-base font-semibold text-primary-theme mt-4 mb-2">1.4 Publicly available data about other Pinterest accounts</h3>
        <p className="text-sm text-secondary-theme mb-6">
          As part of the Service's competitor-analysis features, we collect and store publicly available
          information from Pinterest accounts that are not Service users (for example, public boards, pins, and
          engagement metrics of accounts you choose to track). This data is limited to what is publicly visible on
          Pinterest and is processed on the basis of our legitimate interest in providing competitive analytics to
          our users. We do not collect private or non-public information about any Pinterest account.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">1a. Scope of This Document</h2>
        <p className="text-sm text-secondary-theme mb-2">
          The Service is available to users worldwide. This Policy applies to all users regardless of country of
          residence, with additional provisions for users in the European Union (Section 9) and the State of
          California, USA (Section 10).
        </p>
        <p className="text-sm text-secondary-theme mb-6">
          <strong>Legal basis for processing (EU/EEA users):</strong> we process your data based on (a) performance
          of a contract — to provide the features of the Service you use; (b) your consent — when connecting your
          Pinterest account and when using optional features; (c) legitimate interest — to ensure security, prevent
          abuse, and provide competitor-analysis features based on publicly available data.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">2. How We Use Information</h2>
        <p className="text-sm text-secondary-theme mb-2">We use the collected data to:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li>Provide access to the Service's features (niche analysis, board and pin generation, content planning, competitor tracking);</li>
          <li>Publish content to Pinterest on your behalf, at your direction;</li>
          <li>Process subscription payments and credit purchases;</li>
          <li>Respond to your support requests;</li>
          <li>Ensure security and prevent abuse.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">
          We do not sell or share your personal data with third parties for marketing purposes.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">3. Disclosure to Third Parties</h2>
        <p className="text-sm text-secondary-theme mb-2">
          To operate the Service, we share a limited amount of data with the following external providers (subprocessors):
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li><strong>Hosting and database</strong> — to store your account and project data.</li>
          <li><strong>AI content generation provider</strong> — the text of your requests (niche description, topics for generation) is sent to generate images and text descriptions for pins. Generated images are currently hosted and served from URLs provided by this provider. We are developing in-house permanent storage for generated images; until this is complete, if a generated image becomes unavailable at its source, we will document this limitation in-product and work to regenerate or restore it.</li>
          <li><strong>Payment processor</strong> — when you pay for a subscription or credits, your card data is processed directly by the payment system; we do not receive or store your card numbers.</li>
          <li><strong>Pinterest</strong> — only when you voluntarily connect your account, to the extent of the permissions (read and/or publish) you authorize during that connection.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">
          Each of these providers processes data under its own privacy policy.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">4. Payment</h2>
        <p className="text-sm text-secondary-theme mb-6">
          Payments for subscriptions and credits are processed through a third-party payment operator. We do not
          store and do not have access to your full card details. Information about completed payments (amount,
          date, status) is retained in our system for transaction history and customer support purposes.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">5. Data Retention and Deletion</h2>
        <p className="text-sm text-secondary-theme mb-6">
          We retain your data while your account is active. You may request deletion of your account and
          associated data by contacting us using the details in Section 8. Requests will be processed within a
          reasonable timeframe, except where we are legally required to retain certain information (for example,
          payment records for accounting purposes).
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">6. Your Rights</h2>
        <p className="text-sm text-secondary-theme mb-2">Regardless of your country of residence, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li>request a copy of the data we hold about you;</li>
          <li>request correction of inaccurate data;</li>
          <li>request deletion of your account and associated data;</li>
          <li>revoke the Service's access to your Pinterest account at any time, through Pinterest's own settings;</li>
          <li>withdraw previously given consent to data processing at any time.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">
          To exercise any of these rights, contact us using the details in Section 8.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">7. Children</h2>
        <p className="text-sm text-secondary-theme mb-6">
          The Service is not intended for individuals under 18 years of age, and we do not knowingly collect data
          from minors.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">8. Contact Us</h2>
        <p className="text-sm text-secondary-theme mb-6">
          For any questions about this Privacy Policy or our handling of your data, contact us at:{' '}
          <strong>d65gng532k@gmail.com</strong>
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">9. Additional Provisions for EU/EEA Users (GDPR)</h2>
        <p className="text-sm text-secondary-theme mb-2">
          If you are located in the European Union or European Economic Area, you have the following additional
          rights under the General Data Protection Regulation (GDPR):
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li><strong>Right to data portability</strong> — receive your data in a structured, machine-readable format and transfer it to another provider.</li>
          <li><strong>Right to restrict processing</strong> — request that we temporarily suspend processing of your data in certain cases.</li>
          <li><strong>Right to object</strong> — object to processing based on legitimate interest, including the competitor-data processing described in Section 1.4.</li>
          <li><strong>Right to lodge a complaint</strong> with your country's data protection supervisory authority if you believe your rights have been violated.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">
          <strong>International data transfers.</strong> Some of our service providers (hosting, AI request
          processing) may be located outside the EEA, including in Russia. Such transfers are made on the basis of
          your consent and/or the necessity of performing our contract with you, as these services are required to
          deliver features you have chosen to use.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">10. Additional Provisions for California Residents, USA (CCPA/CPRA)</h2>
        <p className="text-sm text-secondary-theme mb-2">If you are a California resident, under the CCPA/CPRA you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li>know what categories of personal information we collect and for what purpose;</li>
          <li>request deletion of your personal information;</li>
          <li>not be discriminated against for exercising these rights.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">
          We do not sell or share your personal information with third parties for monetary or other valuable
          consideration, under any circumstances.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">11. Cookies and Local Storage</h2>
        <p className="text-sm text-secondary-theme mb-6">
          The Service uses browser local storage (not cookies) to keep you signed in to your account. We do not use
          cookies or local storage for advertising, tracking, or analytics. Because this storage is technically
          necessary for the Service to function, no separate consent is requested; you may clear it at any time
          through your browser settings, in which case you will need to sign in again.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">12. Changes to This Policy</h2>
        <p className="text-sm text-secondary-theme">
          We may update this Privacy Policy from time to time — for example, when we add new features to the
          Service. The "Last updated" date at the top of this document reflects the most recent revision. We will
          notify users of material changes through the Service or by email, where appropriate.
        </p>
      </div>
    </div>
  );
};