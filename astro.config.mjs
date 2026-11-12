// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import emdash from "emdash/astro";
import { d1, r2 } from "@emdash-cms/cloudflare";

// EmDash on Cloudflare Workers: content and schema in D1, media in R2, every page server-rendered.
// The admin is at /_emdash/admin. seed/seed.json defines the schema, sections, menus and the homepage.
export default defineConfig({
  site: "https://dsafw.com",
  output: "server",
  adapter: cloudflare(),
  trailingSlash: "never",
  integrations: [
    react(), // EmDash's admin is a React app
    emdash({
      database: d1({ binding: "DB", session: "auto", coalesce: true }),
      storage: r2({ binding: "MEDIA" }),
    }),
  ],
  // Design system type: Anton (display, sheared 10° to match the logo: `npm run fonts`),
  // Pacifico (eyebrows and section headings), Instrument Sans (everything else).
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Anton Slant",
      cssVariable: "--font-display",
      fallbacks: ["Impact", "Arial Narrow", "sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/AntonSlant.woff2"], weight: 400, style: "normal" }] },
    },
    {
      provider: fontProviders.fontsource(),
      name: "Pacifico",
      cssVariable: "--font-script",
      weights: [400],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["cursive"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Instrument Sans",
      cssVariable: "--font-body",
      weights: [400, 500, 600, 700],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      fallbacks: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
    },
  ],
  devToolbar: { enabled: false },
});
