import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const Mark = (p: P) => (
  <svg viewBox="0 0 64 64" aria-hidden {...p}>
    <rect width="64" height="64" rx="16" fill="currentColor" opacity="0.14" />
    <line x1="12" y1="41" x2="33" y2="41" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <line x1="33" y1="33" x2="52" y2="33" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <circle cx="33" cy="19" r="4.5" fill="#a8c46a" />
  </svg>
);

export const Camera = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.8A1 1 0 0 1 10 3.8h4a1 1 0 0 1 .8.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </svg>
);

export const Car = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 13l1.6-4.3A2 2 0 0 1 8.5 7.4h7a2 2 0 0 1 1.9 1.3L19 13" />
    <path d="M4 13h16a1 1 0 0 1 1 1v3.5h-2.5M3 17.5H5.5M3 14a1 1 0 0 1 1-1" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="16.5" cy="17.5" r="1.8" />
    <path d="M9.3 17.5h5.4" />
  </svg>
);

export const Home = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
  </svg>
);

export const MapPin = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const Arrow = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ArrowLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

export const Close = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base} strokeWidth={2.25} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const Eye = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const Layers = (p: P) => (
  <svg {...base} {...p}>
    <path d="m12 4 8 4.5-8 4.5-8-4.5z" />
    <path d="m4 13 8 4.5 8-4.5" />
  </svg>
);

export const Rank = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 19V11M12 19V5M19 19v-8" />
    <path d="M3 19h18" />
  </svg>
);

export const Dedup = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
  </svg>
);

export const Verify = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" />
    <path d="M9 12.2l2 2 4-4.2" />
  </svg>
);

export const Scan = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M4 12h16" />
  </svg>
);

export const Download = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
  </svg>
);

export const Filter = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const Upload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />
  </svg>
);

export const Locate = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
    <circle cx="12" cy="12" r="7.5" />
  </svg>
);

export const Warn = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4 3 19h18z" />
    <path d="M12 10v4M12 16.5v.5" />
  </svg>
);

export const Leaf = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 19c0-8 5-13 14-13-0.5 9-5 13-13 13" />
    <path d="M5 19c3-4 6-7 10-9" />
  </svg>
);
