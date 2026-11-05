/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_CONSUMER_PRODUCT_NAME?: string;
  readonly VITE_OYNK_SURFACE?: "console" | "control";
  readonly VITE_CONSOLE_URL?: string;
  readonly VITE_CONTROL_URL?: string;
  readonly VITE_SOCKETFI_API_URL?: string;
  readonly VITE_SOCKETFI_CLIENT_ID?: string;
  readonly VITE_LEMONBOOKS_URL?: string;
}
