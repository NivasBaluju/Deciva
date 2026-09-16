import Api from './api';

function triggerBlobDownload(blob, defaultFilename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export const ComplianceAuditApi = {
  async getContractEvidence(documentId) {
    return Api.get(`/api/compliance/documents/${documentId}/evidence`);
  },

  async downloadContractJson(documentId, docName = 'contract') {
    const blob = await Api.get(`/api/compliance/documents/${documentId}/export/json`);
    const cleanName = docName.replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerBlobDownload(blob, `contract_evidence_${cleanName}.json`);
  },

  async downloadContractPdf(documentId, docName = 'contract') {
    const blob = await Api.get(`/api/compliance/documents/${documentId}/export/pdf`);
    const cleanName = docName.replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerBlobDownload(blob, `contract_audit_${cleanName}.pdf`);
  },

  async downloadContractActionsCsv(documentId, docName = 'contract') {
    const blob = await Api.get(`/api/compliance/documents/${documentId}/export/actions.csv`);
    const cleanName = docName.replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerBlobDownload(blob, `contract_actions_${cleanName}.csv`);
  },

  async downloadContractDecisionsCsv(documentId, docName = 'contract') {
    const blob = await Api.get(`/api/compliance/documents/${documentId}/export/decisions.csv`);
    const cleanName = docName.replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerBlobDownload(blob, `contract_decisions_${cleanName}.csv`);
  },

  async downloadContractActivityCsv(documentId, docName = 'contract') {
    const blob = await Api.get(`/api/compliance/documents/${documentId}/export/activity.csv`);
    const cleanName = docName.replace(/[^a-zA-Z0-9_-]/g, '_');
    triggerBlobDownload(blob, `contract_activity_${cleanName}.csv`);
  },

  async getPortfolioEvidence() {
    return Api.get('/api/compliance/portfolio/evidence');
  },

  async downloadPortfolioJson() {
    const blob = await Api.get('/api/compliance/portfolio/export/json');
    triggerBlobDownload(blob, 'portfolio_compliance_evidence.json');
  },

  async downloadPortfolioPdf() {
    const blob = await Api.get('/api/compliance/portfolio/export/pdf');
    triggerBlobDownload(blob, 'portfolio_compliance_audit.pdf');
  },

  async downloadPortfolioActionsCsv() {
    const blob = await Api.get('/api/compliance/portfolio/export/actions.csv');
    triggerBlobDownload(blob, 'portfolio_action_queue.csv');
  },

  async downloadPortfolioContractsCsv() {
    const blob = await Api.get('/api/compliance/portfolio/export/contracts.csv');
    triggerBlobDownload(blob, 'portfolio_contracts_health.csv');
  },

  async verifyEvidence(evidence, expectedHash) {
    return Api.post('/api/compliance/verify', { evidence, expectedHash });
  }
};

export default ComplianceAuditApi;
