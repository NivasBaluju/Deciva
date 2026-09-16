import React, { useState } from 'react';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import ThinkingLoader from '../components/common/ThinkingLoader';
import Breadcrumb from '../components/ui/Breadcrumb';

export function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    capability: 'Contract Diligence & Examination',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setError('Please provide all mandatory fields.');
      return;
    }
    setError('');
    setSubmitting(true);

    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 900);
  };

  return (
    <div className="w-full bg-paper py-20 sm:py-28 min-h-[85vh]">
      <div className="container-wide">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-20 items-start">
          <div className="lg:col-span-5">
            <h1 className="display-02 text-ink tracking-tight mb-6">
              Let’s talk.
            </h1>
            <p className="font-body text-body-lg text-ink-soft leading-relaxed mb-12">
              Tell us briefly about your contract portfolio or legal diligence requirements. A member of enterprise counsel will respond within one business day.
            </p>

            <div className="pt-10 border-t border-rule space-y-6">
              <h2 className="font-body text-heading-02 text-ink font-semibold">
                Direct Communication Protocols
              </h2>
              <div className="space-y-4 font-body text-body-sm text-ink-soft">
                <div>
                  <p className="text-ink font-medium">Enterprise &amp; Executive Briefings</p>
                  <p>briefings@deciva.ai</p>
                  <p className="text-ink-soft text-micro mt-0.5">Encrypted dispatch • 1 business day SLA</p>
                </div>
                <div>
                  <p className="text-ink font-medium">Statutory &amp; Regulatory Inquiries</p>
                  <p>legal@deciva.ai</p>
                  <p className="text-ink-soft text-micro mt-0.5">Delaware Chancery, UCC &amp; EU GDPR compliance</p>
                </div>
                <div>
                  <p className="text-ink font-medium">Zero-Trust Security &amp; Audit Operations</p>
                  <p>security@deciva.ai</p>
                  <p className="text-ink-soft text-micro mt-0.5">SHA-256 ledger verification &amp; SOC 2 reports</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-paper-dim p-8 sm:p-12 border border-rule">
            {submitted ? (
              <div
                role="status"
                aria-live="polite"
                className="py-12 sm:py-16 text-center flex flex-col items-center justify-center animate-fade-in"
              >
                <div className="w-12 h-12 border border-ink flex items-center justify-center mb-6">
                  <span className="font-display text-xl font-medium text-ink">✓</span>
                </div>
                <h3 className="display-03 text-ink tracking-tight mb-4">
                  Message sent.
                </h3>
                <p className="font-body text-body text-ink-soft max-w-md mx-auto leading-relaxed">
                  Your inquiry has been routed to enterprise systems counsel. A formal response will be dispatched to {formData.email} within one business day.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({
                      name: '',
                      email: '',
                      company: '',
                      capability: 'Contract Diligence & Examination',
                      message: ''
                    });
                  }}
                  className="font-body text-label text-ink underline mt-8"
                >
                  Send another message
                </button>
              </div>
            ) : submitting ? (
              <div className="py-20 text-center">
                <ThinkingLoader
                  state="working"
                  size={64}
                  caption="Routing briefing request to enterprise counsel..."
                  subcaption="Computing secure intake digest and establishing privileged session"
                />
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <h3 className="font-body text-heading-01 text-ink font-semibold mb-8 pb-4 border-b border-rule">
                  Schedule Executive Briefing
                </h3>

                <FormField
                  id="name"
                  label="Full Name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Katherine Vance, General Counsel"
                />

                <FormField
                  id="email"
                  label="Corporate Email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="counsel@enterprise.com"
                />

                <FormField
                  id="company"
                  label="Enterprise / Organization"
                  value={formData.company}
                  onChange={handleChange}
                  placeholder="Organization or Firm Name"
                />

                <div className="mb-6">
                  <label htmlFor="capability" className="block font-body text-label text-ink-soft mb-2">
                    Primary Area of Diligence
                  </label>
                  <select
                    id="capability"
                    value={formData.capability}
                    onChange={handleChange}
                    className="w-full bg-paper-dim border-0 border-b border-rule focus:border-b-2 focus:border-ink px-4 py-3 font-body text-body text-ink outline-none transition-colors duration-instant cursor-pointer"
                  >
                    <option value="Contract Diligence & Examination">Contract Diligence &amp; Examination</option>
                    <option value="Autonomous Risk Radar">Autonomous Risk Radar</option>
                    <option value="Bilateral Negotiation Workbench">Bilateral Negotiation Workbench</option>
                    <option value="Portfolio Health & Governance">Portfolio Health &amp; Governance</option>
                    <option value="Cryptographic Audit Ledger">Cryptographic Audit Ledger</option>
                    <option value="Regulatory Cross-Check">Jurisdictional Regulatory Cross-Check</option>
                  </select>
                </div>

                <FormField
                  id="message"
                  label="Matter Summary / Diligence Scope"
                  as="textarea"
                  rows={4}
                  required
                  value={formData.message}
                  onChange={handleChange}
                  placeholder="Briefly describe the contract volume, counterparty exposure, or diligence objectives..."
                />

                {error && (
                  <p role="alert" className="font-body text-body-sm text-ink mb-6 font-medium">
                    {error}
                  </p>
                )}

                <div className="pt-4 border-t border-rule flex items-center justify-between">
                  <span className="font-body text-micro text-neutral-500">
                    * Mandatory corporate field
                  </span>
                  <Button type="submit" variant="primary">
                    Send message
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Contact;
