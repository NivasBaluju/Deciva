import React from 'react';
import Icon from '../common/Icon';

export const ActionFilters = ({
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  ownerFilter,
  setOwnerFilter,
  sortOption,
  setSortOption,
  searchQuery,
  setSearchQuery,
  counts = {}
}) => {
  return (
    <div
      className="card mb-20"
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        padding: '16px'
      }}
    >
      <div className="flex-between mb-12" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action titles, clauses, or notes..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: '13px',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#FFF'
            }}
          />
          <div style={{ position: 'absolute', left: '10px', top: '10px', color: '#71717A' }}>
            <Icon.eye width={14} height={14} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-muted small" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
            Sort by:
          </span>
          <select
            className="input"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            style={{
              padding: '8px 10px',
              fontSize: '12.5px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#FFF'
            }}
          >
            <option value="HIGHEST_PRIORITY">Highest Priority First (Default)</option>
            <option value="LOWEST_PRIORITY">Lowest Priority First</option>
            <option value="DUE_SOONEST">Due Date (Soonest First)</option>
            <option value="NEWEST">Newest Created First</option>
            <option value="OLDEST">Oldest Created First</option>
          </select>
        </div>
      </div>

      <div className="flex gap-16 flex-wrap" style={{ alignItems: 'center', fontSize: '12.5px' }}>
        <div className="flex gap-6 flex-wrap" style={{ alignItems: 'center' }}>
          <span className="text-muted small" style={{ fontWeight: 600, marginRight: '2px' }}>Status:</span>
          {[
            { id: 'ALL', label: 'All', count: counts.total || 0 },
            { id: 'OPEN', label: 'Open', count: counts.open || 0 },
            { id: 'IN_REVIEW', label: 'In Review', count: counts.inReview || 0 },
            { id: 'RESOLVED', label: 'Resolved', count: counts.resolved || 0 },
            { id: 'DISMISSED', label: 'Dismissed', count: counts.dismissed || 0 }
          ].map((s) => {
            const isActive = statusFilter === s.id;
            return (
              <button
                key={s.id}
                className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatusFilter(s.id)}
                style={{
                  padding: '3px 10px',
                  fontSize: '12px',
                  borderRadius: '20px',
                  background: isActive ? undefined : 'rgba(255,255,255,0.04)'
                }}
              >
                {s.label} <span className="mono text-muted" style={{ fontSize: '10.5px', opacity: 0.8 }}>({s.count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-6 flex-wrap" style={{ alignItems: 'center' }}>
          <span className="text-muted small" style={{ fontWeight: 600, marginRight: '2px' }}>Severity:</span>
          {['ALL', 'CRITICAL', 'IMPORTANT', 'MONITORING'].map((cat) => {
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '3px 8px',
                  fontSize: '11.5px',
                  borderRadius: '20px',
                  background: isActive ? undefined : 'rgba(255,255,255,0.04)'
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="flex gap-6 flex-wrap" style={{ alignItems: 'center' }}>
          <span className="text-muted small" style={{ fontWeight: 600, marginRight: '2px' }}>Owner:</span>
          {[
            { id: 'ALL', label: 'All Owners' },
            { id: 'ASSIGNED_TO_ME', label: 'Assigned to Me' },
            { id: 'UNASSIGNED', label: 'Unassigned' }
          ].map((own) => {
            const isActive = ownerFilter === own.id;
            return (
              <button
                key={own.id}
                className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setOwnerFilter(own.id)}
                style={{
                  padding: '3px 8px',
                  fontSize: '11.5px',
                  borderRadius: '20px',
                  background: isActive ? undefined : 'rgba(255,255,255,0.04)'
                }}
              >
                {own.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ActionFilters;
