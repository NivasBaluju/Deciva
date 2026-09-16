import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtDate } from '../../utils/formatters';

const DEFAULT_COLUMNS = [
  { id: 'contract', label: 'Contract', visible: true },
  { id: 'risk', label: 'Risk', visible: true },
  { id: 'lifecycle', label: 'Lifecycle', visible: true },
  { id: 'renewal', label: 'Renewal', visible: true },
  { id: 'exposure', label: 'Exposure', visible: true },
  { id: 'policy', label: 'Policy', visible: true },
  { id: 'approval', label: 'Approval', visible: true },
  { id: 'monitoring', label: 'Monitoring', visible: true },
  { id: 'owner', label: 'Owner', visible: true },
  { id: 'lastChange', label: 'Last Change', visible: true },
  { id: 'nextAction', label: 'Next Action', visible: true }
];

export const CompactPortfolioTableView = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [sortField, setSortField] = useState('lastChange');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [showColSettings, setShowColSettings] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await Api.get('/api/documents');
      const docs = Array.isArray(res) ? res : res.documents || [];
      setDocuments(docs);
    } catch (err) {
      toast(err.message || 'Failed to load portfolio documents', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (colId) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, visible: !c.visible } : c))
    );
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      const name = (d.original_name || d.filename || d.name || '').toLowerCase();
      const matchesSearch = !searchTerm || name.includes(searchTerm.toLowerCase());

      const score = d.risk_score || d.riskScore || 0;
      let matchesRisk = true;
      if (riskFilter === 'HIGH') matchesRisk = score >= 60;
      else if (riskFilter === 'MEDIUM') matchesRisk = score >= 30 && score < 60;
      else if (riskFilter === 'LOW') matchesRisk = score < 30;

      return matchesSearch && matchesRisk;
    });
  }, [documents, searchTerm, riskFilter]);

  const sortedDocs = useMemo(() => {
    return [...filteredDocs].sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'contract':
          valA = (a.original_name || a.filename || '').toLowerCase();
          valB = (b.original_name || b.filename || '').toLowerCase();
          break;
        case 'risk':
          valA = a.risk_score || a.riskScore || 0;
          valB = b.risk_score || b.riskScore || 0;
          break;
        case 'lifecycle':
          valA = a.analysis_status || a.analysisStatus || '';
          valB = b.analysis_status || b.analysisStatus || '';
          break;
        case 'lastChange':
        default:
          valA = new Date(a.updated_at || a.created_at || 0).getTime();
          valB = new Date(b.updated_at || b.created_at || 0).getTime();
          break;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredDocs, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedDocs.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedDocs.slice(start, start + pageSize);
  }, [sortedDocs, page, pageSize]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (paginatedDocs.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.min(prev + 1, paginatedDocs.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        const currentDoc = paginatedDocs[selectedRowIndex];
        if (currentDoc) {
          navigate(`/document/${currentDoc.id || currentDoc.document_id}/overview`);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedDocs, selectedRowIndex, navigate]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const isColVisible = (colId) => {
    const col = columns.find((c) => c.id === colId);
    return col ? col.visible : true;
  };

  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: '#0A0A0E',
        color: '#FFFFFF',
        fontFamily: 'var(--font-sans, "Public Sans", sans-serif)',
        padding: '16px'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '12px',
          marginBottom: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#A1A1AA' }}>
            OPERATIONAL FILTER:
          </span>
          <input
            type="text"
            placeholder="Search contracts…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '5px 10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '12px',
              width: '180px',
              outline: 'none',
              backgroundColor: '#121218',
              color: '#FFFFFF'
            }}
          />

          <select
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '5px 10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '12px',
              backgroundColor: '#121218',
              color: '#FFFFFF'
            }}
          >
            <option value="ALL">All Risk Tiers</option>
            <option value="HIGH">High Risk (≥60)</option>
            <option value="MEDIUM">Medium Risk (30-59)</option>
            <option value="LOW">Low Risk (&lt;30)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#A1A1AA', fontFamily: 'monospace' }}>
            {sortedDocs.length} Total Contracts | Arrow Keys [↑/↓] to Navigate | [Enter] to Open
          </span>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColSettings(!showColSettings)}
              style={{
                fontSize: '11px',
                padding: '5px 10px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#FFFFFF',
                cursor: 'pointer'
              }}
            >
              ⚙ Columns
            </button>

            {showColSettings && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '28px',
                  background: '#121218',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '8px 12px',
                  zIndex: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  minWidth: '160px',
                  color: '#FFFFFF'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: '#A1A1AA' }}>Column Visibility</div>
                {columns.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', margin: '4px 0', cursor: 'pointer', color: '#D4D4D8' }}>
                    <input type="checkbox" checked={c.visible} onChange={() => toggleColumn(c.id)} />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            textAlign: 'left'
          }}
        >
          <thead>
            <tr style={{ background: '#121218', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', color: '#FFFFFF' }}>
              {isColVisible('contract') && (
                <th onClick={() => handleSort('contract')} style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700 }}>
                  Contract {sortField === 'contract' && (sortAsc ? '▲' : '▼')}
                </th>
              )}
              {isColVisible('risk') && (
                <th onClick={() => handleSort('risk')} style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700, textAlign: 'center' }}>
                  Risk {sortField === 'risk' && (sortAsc ? '▲' : '▼')}
                </th>
              )}
              {isColVisible('lifecycle') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Lifecycle</th>}
              {isColVisible('renewal') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Renewal</th>}
              {isColVisible('exposure') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Exposure</th>}
              {isColVisible('policy') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Policy</th>}
              {isColVisible('approval') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Approval</th>}
              {isColVisible('monitoring') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Monitoring</th>}
              {isColVisible('owner') && <th style={{ padding: '8px 10px', fontWeight: 700 }}>Owner</th>}
              {isColVisible('lastChange') && (
                <th onClick={() => handleSort('lastChange')} style={{ padding: '8px 10px', cursor: 'pointer', fontWeight: 700 }}>
                  Last Change {sortField === 'lastChange' && (sortAsc ? '▲' : '▼')}
                </th>
              )}
              {isColVisible('nextAction') && <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Next Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#A1A1AA' }}>
                  Loading portfolio records…
                </td>
              </tr>
            ) : paginatedDocs.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#A1A1AA' }}>
                  No matching contracts found for the selected filter.
                </td>
              </tr>
            ) : (
              paginatedDocs.map((d, idx) => {
                const isSelected = idx === selectedRowIndex;
                const score = d.risk_score || d.riskScore || 0;
                const docId = d.id || d.document_id;
                const name = d.original_name || d.filename || d.name || 'Untitled';
                const status = d.analysis_status || d.analysisStatus || 'NOT_STARTED';

                return (
                  <tr
                    key={docId}
                    onClick={() => {
                      setSelectedRowIndex(idx);
                      navigate(`/document/${docId}/overview`);
                    }}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : idx % 2 === 0 ? '#0A0A0E' : 'rgba(255, 255, 255, 0.03)'
                    }}
                  >
                    {isColVisible('contract') && (
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#FFFFFF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#71717A', fontFamily: 'monospace' }}>#{docId.slice(0, 8)}</span>
                          <span className="truncate" style={{ maxWidth: '180px' }}>{name}</span>
                        </div>
                      </td>
                    )}

                    {isColVisible('risk') && (
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontWeight: 700,
                            fontSize: '11px',
                            borderRadius: '2px',
                            color: score >= 60 ? '#FCA5A5' : score >= 30 ? '#FDE047' : '#86EFAC',
                            background: score >= 60 ? 'rgba(239, 68, 68, 0.2)' : score >= 30 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            border: `1px solid ${score >= 60 ? 'rgba(239, 68, 68, 0.4)' : score >= 30 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                          }}
                        >
                          {score}
                        </span>
                      </td>
                    )}

                    {isColVisible('lifecycle') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: '#D4D4D8' }}>
                        <span style={{ fontFamily: 'monospace' }}>{status}</span>
                      </td>
                    )}

                    {isColVisible('renewal') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: '#A1A1AA' }}>
                        {d.renewal_date ? fmtDate(d.renewal_date) : 'NOT_SPECIFIED'}
                      </td>
                    )}

                    {isColVisible('exposure') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: d.exposure ? '#FFFFFF' : '#71717A' }}>
                        {d.exposure || 'NOT_AVAILABLE'}
                      </td>
                    )}

                    {isColVisible('policy') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px' }}>
                        <span style={{ color: d.policy_violations ? '#F87171' : '#34D399', fontWeight: 600 }}>
                          {d.policy_violations ? `⚠ ${d.policy_violations} Violations` : '✓ Compliant'}
                        </span>
                      </td>
                    )}

                    {isColVisible('approval') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: '#D4D4D8' }}>
                        <span style={{ fontFamily: 'monospace' }}>{d.approval_status || 'NOT_REQUESTED'}</span>
                      </td>
                    )}

                    {isColVisible('monitoring') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px' }}>
                        <span style={{ color: d.monitoring_active ? '#34D399' : '#71717A' }}>
                          {d.monitoring_active ? '● Active' : '○ Standby'}
                        </span>
                      </td>
                    )}

                    {isColVisible('owner') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: '#D4D4D8' }}>
                        {d.owner_name || d.user_email || 'Legal Team'}
                      </td>
                    )}

                    {isColVisible('lastChange') && (
                      <td style={{ padding: '8px 10px', fontSize: '11px', color: '#A1A1AA', fontFamily: 'monospace' }}>
                        {fmtDate(d.updated_at || d.created_at)}
                      </td>
                    )}

                    {isColVisible('nextAction') && (
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/document/${docId}/negotiation`);
                          }}
                          style={{
                            padding: '3px 10px',
                            fontSize: '11px',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#FFFFFF',
                            fontWeight: 600,
                            cursor: 'pointer',
                            borderRadius: '2px'
                          }}
                        >
                          Review →
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '11px',
          color: '#A1A1AA'
        }}
      >
        <div>
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedDocs.length)} of {sortedDocs.length}
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            style={{
              padding: '4px 10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#FFFFFF',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.4 : 1
            }}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            style={{
              padding: '4px 10px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#FFFFFF',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.4 : 1
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompactPortfolioTableView;
