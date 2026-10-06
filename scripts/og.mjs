// Gera public/og.png (1200×630, tema escuro) a partir de public/og.html. Servidor de pé: pnpm serve.
import { chromium } from "playwright-core";
const BASE = process.argv[2] || "http://127.0.0.1:4195";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: "dark", deviceScaleFactor: 1 });
await p.goto(`${BASE}/og.html`, { waitUntil: "networkidle" });
await p.waitForSelector("body[data-pronto]");
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: "public/og.png" });
await b.close();
