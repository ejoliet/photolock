/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PHOTOLOCK_PUBLIC_KEY: string;
  readonly PHOTOLOCK_SINGLEFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
