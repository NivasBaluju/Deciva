import Api from './api';

export const GovernanceApi = {
  getOverview: async () => {
    return Api.get('/api/governance/overview');
  },
  listPolicies: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return Api.get(`/api/governance/policies${qs ? '?' + qs : ''}`);
  },
  getPolicy: async (policyId) => {
    return Api.get(`/api/governance/policies/${policyId}`);
  },
  createPolicy: async (data) => {
    return Api.post('/api/governance/policies', data);
  },
  updatePolicy: async (policyId, data) => {
    return Api.put(`/api/governance/policies/${policyId}`, data);
  },
  addControl: async (policyId, data) => {
    return Api.post(`/api/governance/policies/${policyId}/controls`, data);
  },
  updateControl: async (controlId, data) => {
    return Api.put(`/api/governance/controls/${controlId}`, data);
  },
  simulatePolicyDryRun: async (policyId, documentId) => {
    return Api.post(`/api/governance/policies/${policyId}/dry-run`, { document_id: documentId });
  },

  getDocumentCompliance: async (documentId) => {
    return Api.get(`/api/documents/${documentId}/compliance-governance`);
  },
  evaluateDocumentCompliance: async (documentId, options = {}) => {
    return Api.post(`/api/documents/${documentId}/compliance-governance/evaluate`, options);
  },
  getDocumentFindings: async (documentId) => {
    return Api.get(`/api/documents/${documentId}/compliance-governance/findings`);
  },

  requestException: async (documentId, findingId, reason) => {
    return Api.post(`/api/documents/${documentId}/compliance-governance/findings/${findingId}/exception`, { reason });
  },
  listExceptions: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return Api.get(`/api/governance/exceptions${qs ? '?' + qs : ''}`);
  },
  approveException: async (exceptionId, data = {}) => {
    return Api.post(`/api/governance/exceptions/${exceptionId}/approve`, data);
  },
  rejectException: async (exceptionId, data = {}) => {
    return Api.post(`/api/governance/exceptions/${exceptionId}/reject`, data);
  },
  revokeException: async (exceptionId) => {
    return Api.post(`/api/governance/exceptions/${exceptionId}/revoke`);
  }
};

export default GovernanceApi;
