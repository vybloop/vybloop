import { html, svg } from 'lit';

const iconBase = (content) => html`
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round">
    ${content}
  </svg>
`;

export const iconPlus = iconBase(svg`
  <path d="M12 5v14M5 12h14"/>
`);

export const iconArrowLeft = iconBase(svg`
  <path d="M19 12H5"/>
  <path d="m12 19-7-7 7-7"/>
`);

export const iconArrowRight = iconBase(svg`
  <path d="M5 12h14"/>
  <path d="m12 5 7 7-7 7"/>
`);

export const iconSearch = iconBase(svg`
  <circle cx="11" cy="11" r="7"/>
  <path d="m20 20-3.5-3.5"/>
`);

export const iconPlay = iconBase(svg`
  <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>
`);

export const iconStop = iconBase(svg`
  <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>
`);

export const iconGit = iconBase(svg`
  <circle cx="6" cy="6" r="2"/>
  <circle cx="6" cy="18" r="2"/>
  <circle cx="18" cy="12" r="2"/>
  <path d="M6 8v8"/>
  <path d="M8 6h6a4 4 0 0 1 4 4v2"/>
`);

export const iconBranch = iconBase(svg`
  <circle cx="6" cy="5" r="2"/>
  <circle cx="6" cy="19" r="2"/>
  <circle cx="18" cy="9" r="2"/>
  <path d="M6 7v10"/>
  <path d="M18 11c0 3.5-3 5-6 5"/>
  <path d="M8 5h6a4 4 0 0 1 4 4"/>
`);

export const iconChevron = iconBase(svg`
  <path d="m9 6 6 6-6 6"/>
`);

export const iconChevronDown = iconBase(svg`
  <path d="m6 9 6 6 6-6"/>
`);

export const iconCheck = iconBase(svg`
  <path d="m5 12 5 5L20 7"/>
`);

export const iconClose = iconBase(svg`
  <path d="M6 6l12 12M18 6 6 18"/>
`);

export const iconMenu = iconBase(svg`
  <path d="M3 6h18M3 12h18M3 18h18"/>
`);

export const iconSettings = iconBase(svg`
  <circle cx="12" cy="12" r="3"/>
  <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
`);

export const iconTerminal = iconBase(svg`
  <path d="m5 8 4 4-4 4M12 16h7"/>
`);

export const iconRefresh = iconBase(svg`
  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
  <path d="M3 3v5h5"/>
  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
  <path d="M16 16h5v5"/>
`);

export const iconExternal = iconBase(svg`
  <path d="M15 3h6v6"/>
  <path d="M21 3 10 14"/>
  <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>
`);

export const iconCopy = iconBase(svg`
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
`);

export const iconBook = iconBase(svg`
  <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/>
  <path d="M4 5v16"/>
`);

export const iconSparkle = iconBase(svg`
  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
`);

export const iconGrid = iconBase(svg`
  <rect x="3" y="3" width="7" height="7" rx="1"/>
  <rect x="14" y="3" width="7" height="7" rx="1"/>
  <rect x="3" y="14" width="7" height="7" rx="1"/>
  <rect x="14" y="14" width="7" height="7" rx="1"/>
`);

export const iconList = iconBase(svg`
  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
`);

export const iconPencil = iconBase(svg`
  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
`);

export const iconSend = iconBase(svg`
  <path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>
`);
