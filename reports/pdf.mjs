import puppeteer from 'puppeteer';
import { makeHtml } from './html.mjs';

// One source for the on-screen report and PDF: Chromium preserves CSS, SVGs and text.
export async function makePdf(result, company) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1123, height: 794 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent(makeHtml(result, company), { waitUntil: 'load' });
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({
      format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true,
      scale: 1, timeout: 60000,
    }));
  } finally {
    await browser.close();
  }
}
