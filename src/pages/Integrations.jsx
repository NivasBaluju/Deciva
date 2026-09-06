import React from 'react';
import IntegrationConsole from '../components/integrations/IntegrationConsole';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import PageTransition from '../components/common/PageTransition';

export default function Integrations() {
  return (
    <PageTransition>
      <div className="w-full text-ink pb-16">
        <div className="container-wide">
          <div className="mb-6">
            <Breadcrumb items={[{ label: 'Cockpit', href: '/dashboard' }, { label: 'Integrations' }]} />
            <h1 className="font-display text-3xl font-medium tracking-tight mt-2 text-ink">
              Enterprise Integrations
            </h1>
            <p className="font-body text-sm text-muted mt-1 max-w-2xl">
              Connect Deciva with external document repositories, CRM/ERP systems, and enterprise webhook pipelines while preserving internal governance authority.
            </p>
          </div>

          <IntegrationConsole />
        </div>
      </div>
    </PageTransition>
  );
}
