import React from 'react';
import { Link } from 'react-router-dom';

export const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-page px-4 py-12">
      <div className="max-w-3xl mx-auto bg-surface border border-subtle rounded-2xl p-8 md:p-12">
        <Link to="/" className="text-sm text-accent mb-6 inline-block">← Back</Link>
        <h1 className="text-3xl font-semibold text-primary-theme font-['Outfit'] mb-2">Terms of Service</h1>
        <p className="text-sm text-secondary-theme mb-8">Last updated: [UPDATE DATE WHEN PUBLISHED]</p>

        <p className="text-sm text-secondary-theme mb-6">
          These Terms of Service ("Terms") govern your use of PinSprig (the "Service"), available at [YOUR FINAL
          DOMAIN]. By creating an account or using the Service, you agree to these Terms.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">1. Who Operates the Service</h2>
        <p className="text-sm text-secondary-theme mb-6">
          The Service is operated by [LEGAL NAME / SELF-EMPLOYED STATUS — TO BE ADDED ONCE REGISTRATION IS
          COMPLETE], a self-employed individual / sole proprietor registered in the Russian Federation. Contact:{' '}
          <strong>d65gng532k@gmail.com</strong>.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">2. The Service</h2>
        <p className="text-sm text-secondary-theme mb-4">
          PinSprig is an AI-assisted tool that helps you analyze your website and Pinterest presence, discover
          content and keyword opportunities, generate pin images and descriptions, organize them into boards,
          schedule a publishing plan, and — where you choose to connect your Pinterest account and grant the
          relevant permissions — publish content to Pinterest on your behalf.
        </p>
        <p className="text-sm text-secondary-theme mb-6">
          The Service also provides competitor-analysis features based on publicly available Pinterest data, as
          described in our Privacy Policy.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">3. Accounts</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-6">
          <li>You must be at least 18 years old to use the Service.</li>
          <li>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</li>
          <li>You must provide accurate information when creating your account and your projects.</li>
        </ul>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">4. Subscriptions, Credits, and Billing</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-6">
          <li>The Service is offered through subscription plans and/or one-time credit packs, as described on our Pricing page.</li>
          <li>Credits included in a subscription plan are refreshed each billing cycle and do not carry over if unused. Credits purchased separately as a pack do not expire and carry over between billing cycles.</li>
          <li>When generating content, credits included in your subscription are used first; separately purchased credits are used only after your subscription credits are exhausted.</li>
          <li>Payments are processed by a third-party payment provider. We do not store your full card details.</li>
          <li>Except where required by applicable law, payments are non-refundable once credits have been used to generate content. If a payment was charged in error or the Service failed to deliver what you paid for, contact us at the email above and we will review your case.</li>
          <li>We reserve the right to change prices or plans going forward; changes will not apply retroactively to a billing period you have already paid for.</li>
        </ul>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">5. High-Demand Periods</h2>
        <p className="text-sm text-secondary-theme mb-6">
          During periods of unusually high demand — for example, shortly after public announcements of the Service
          — content generation may take longer than usual, up to 24–48 hours instead of the typical few minutes.
          Your account access, chat assistant, and analytics tools remain available immediately after payment. We
          will show you an in-product notification when a request is queued due to high demand and again once it
          is complete.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">6. Acceptable Use</h2>
        <p className="text-sm text-secondary-theme mb-2">You agree not to use the Service to:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-theme mb-4">
          <li>generate or publish content that is illegal, infringing, hateful, sexually explicit, or otherwise violates Pinterest's own policies or the law of your jurisdiction;</li>
          <li>attempt to interfere with, overload, or gain unauthorized access to the Service's systems;</li>
          <li>use automated means to extract data from the Service beyond what is provided through its normal features;</li>
          <li>resell or sublicense access to the Service without our written permission.</li>
        </ul>
        <p className="text-sm text-secondary-theme mb-6">We may suspend or terminate accounts that violate this section.</p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">7. Your Content</h2>
        <p className="text-sm text-secondary-theme mb-4">
          You retain ownership of the website content, project information, and any custom instructions you provide
          to the Service. You grant us a limited license to process this information solely to provide the Service
          to you (for example, to generate pins and boards on your behalf).
        </p>
        <p className="text-sm text-secondary-theme mb-6">
          Content generated by the Service for your account (pin images, titles, descriptions, boards) is yours to
          use, publish, and edit as you see fit, subject to Pinterest's own content policies when published to
          Pinterest.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">8. Your Pinterest Account</h2>
        <p className="text-sm text-secondary-theme mb-6">
          If you choose to connect a Pinterest account, you remain subject to Pinterest's own Terms of Service and
          policies. We are not responsible for actions taken by Pinterest regarding your account (including
          suspension, API access changes, or content removal), as these are outside our control. You may disconnect
          your Pinterest account from the Service at any time through Pinterest's own settings.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">9. Service Availability</h2>
        <p className="text-sm text-secondary-theme mb-6">
          The Service is provided "as is" and "as available." We do not guarantee uninterrupted or error-free
          operation. We may modify, suspend, or discontinue features of the Service at any time, and will make
          reasonable efforts to notify you of material changes in advance.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">10. Limitation of Liability</h2>
        <p className="text-sm text-secondary-theme mb-4">
          To the maximum extent permitted by applicable law, we are not liable for indirect, incidental, or
          consequential damages arising from your use of the Service, including loss of revenue, data, or Pinterest
          account standing. Our total liability for any claim related to the Service is limited to the amount you
          paid us in the three months preceding the claim.
        </p>
        <p className="text-sm text-secondary-theme mb-6">
          Nothing in these Terms limits liability that cannot be limited under applicable law, including liability
          arising from our gross negligence or willful misconduct.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">11. Termination</h2>
        <p className="text-sm text-secondary-theme mb-6">
          You may stop using the Service and request deletion of your account at any time by contacting us (see
          Privacy Policy, Section 8). We may suspend or terminate your account for violation of these Terms, with
          notice where reasonably possible.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">12. Changes to These Terms</h2>
        <p className="text-sm text-secondary-theme mb-6">
          We may update these Terms from time to time, for example when we add new features to the Service. The
          "Last updated" date above reflects the most recent revision. We will notify users of material changes
          through the Service or by email where appropriate.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">13. Governing Law</h2>
        <p className="text-sm text-secondary-theme mb-6">
          These Terms are governed by the laws of the Russian Federation, without regard to conflict-of-law
          principles, except where mandatory consumer-protection laws of your own country of residence provide you
          with additional rights that cannot be waived.
        </p>

        <h2 className="text-xl font-semibold text-primary-theme mt-8 mb-3">14. Contact</h2>
        <p className="text-sm text-secondary-theme">
          Questions about these Terms can be sent to: <strong>d65gng532k@gmail.com</strong>
        </p>
      </div>
    </div>
  );
};