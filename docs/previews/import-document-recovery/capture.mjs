import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [size, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    for (const version of ['before', 'after']) {
      await page.goto(`${pathToFileURL(path.join(directory, 'index.html'))}?version=${version}`);
      await page.screenshot({ path: path.join(directory, `${version}-${size}.png`), fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
