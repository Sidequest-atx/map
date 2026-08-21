/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_SURFACE?: "site" | "app";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
