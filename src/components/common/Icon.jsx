import React from 'react';

const defaultProps = {
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};

export const Icon = (props) => {
  const { name, size, width, height, className, color, style, ...rest } = props;
  const w = size || width || 16;
  const h = size || height || 16;
  const rawName = String(name || '').trim();
  const camelName = rawName.toLowerCase().replace(/[-_]([a-z0-9])/g, (_, c) => c.toUpperCase());

  const Component =
    Icon[rawName] ||
    Icon[camelName] ||
    Icon[rawName.toLowerCase()] ||
    Icon.document;

  if (!Component) return null;
  return <Component width={w} height={h} className={className} stroke={color || 'currentColor'} style={style} {...rest} />;
};

Icon.shield = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

Icon.scales = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M12 3v18" />
    <path d="M3 9l9-6 9 6" />
    <path d="M5 11l-2 5h4L5 11z" />
    <path d="M19 11l-2 5h4l-2-5z" />
    <path d="M8 21h8" />
  </svg>
);

Icon.document = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

Icon.upload = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
  </svg>
);

Icon.grid = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

Icon.chat = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

Icon.calendar = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

Icon.pen = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

Icon.lock = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

Icon.check = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} strokeWidth={2.2} {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

Icon.alert = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

Icon.alertTriangle = Icon.alert;
Icon['alert-triangle'] = Icon.alert;

Icon.trending = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

Icon.compare = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
  </svg>
);

Icon.share = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

Icon.download = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="8 17 12 21 16 17" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
  </svg>
);

Icon.logout = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

Icon.trash = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

Icon.link = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

Icon.eye = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

Icon.star = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

Icon.settings = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

Icon.file = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

Icon.fileText = Icon.file;
Icon['file-text'] = Icon.file;

Icon.key = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-2 2 1.5 1.5-3 3A6 6 0 117 8a6 6 0 014.24 1.76l6.76-6.76z" />
  </svg>
);

Icon.brain = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" />
  </svg>
);

Icon.target = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

Icon.zap = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

Icon.refresh = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

Icon.refreshCw = Icon.refresh;
Icon['refresh-cw'] = Icon.refresh;

Icon.user = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

Icon.clock = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

Icon.filter = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

Icon.x = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

Icon.info = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

Icon.chevronRight = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

Icon.chevronDown = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

Icon.arrowRight = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

Icon.history = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M12 8v4l3 3" />
    <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
  </svg>
);

Icon.checkCircle = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

Icon['check-circle'] = Icon.checkCircle;

Icon.plus = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

Icon.chart = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

Icon.barChart = Icon.chart;
Icon.barChart2 = Icon.chart;
Icon['bar-chart-2'] = Icon.chart;

Icon.code = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

Icon.table = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
  </svg>
);

Icon.layers = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

Icon.activity = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

Icon.database = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

Icon.bell = (props) => (
  <svg viewBox="0 0 24 24" {...defaultProps} {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default Icon;
