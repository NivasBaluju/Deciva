import Api from './api';

export const WorkflowApi = {
  getWorkflowInbox(params = {}) {
    const query = new URLSearchParams(params).toString();
    return Api.get(`/api/workflow/inbox${query ? `?${query}` : ''}`);
  },

  getPendingApprovals() {
    return Api.get('/api/workflow/pending-approvals');
  },

  getMyDecisions() {
    return Api.get('/api/workflow/my-decisions');
  },

  getDocumentDecisions(docId) {
    return Api.get(`/api/documents/${encodeURIComponent(docId)}/decisions`);
  },

  createDecision(docId, decisionData) {
    return Api.post(`/api/documents/${encodeURIComponent(docId)}/decisions`, decisionData);
  },

  evaluatePolicy(docId, draftContext) {
    return Api.post(`/api/documents/${encodeURIComponent(docId)}/decisions/policy-evaluate`, draftContext);
  },

  getDecision(decisionId) {
    return Api.get(`/api/workflow/decisions/${encodeURIComponent(decisionId)}`);
  },

  submitDecision(decisionId, data = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/submit`, data);
  },

  assignReviewer(decisionId, reviewerData) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/assign-reviewer`, reviewerData);
  },

  assignApprover(decisionId, approverData) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/assign-approver`, approverData);
  },

  requestChanges(decisionId, requestData) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/request-changes`, requestData);
  },

  resubmitDecision(decisionId, data = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/resubmit`, data);
  },

  approveDecision(decisionId, approvalData = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/approve`, approvalData);
  },

  rejectDecision(decisionId, rejectData = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/reject`, rejectData);
  },

  completeDecision(decisionId, completeData = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/complete`, completeData);
  },

  cancelDecision(decisionId, cancelData = {}) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/cancel`, cancelData);
  },

  addComment(decisionId, commentData) {
    return Api.post(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/comments`, commentData);
  },

  resolveComment(commentId) {
    return Api.post(`/api/workflow/comments/${encodeURIComponent(commentId)}/resolve`, {});
  },

  getTimeline(decisionId) {
    return Api.get(`/api/workflow/decisions/${encodeURIComponent(decisionId)}/timeline`);
  }
};

export default WorkflowApi;
