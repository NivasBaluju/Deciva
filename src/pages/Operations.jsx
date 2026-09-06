import React from 'react';
import EnterpriseOperationsConsole from '../components/admin/EnterpriseOperationsConsole';
import PageTransition from '../components/common/PageTransition';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function Operations() {
  return (
    <PageTransition>
      <div className="operations-page-container pb-16">
        <Breadcrumb
          items={[
            { label: 'Cockpit', href: '/dashboard' },
            { label: 'Operations & Disaster Recovery' }
          ]}
        />
        <EnterpriseOperationsConsole />
      </div>
    </PageTransition>
  );
}
