import { createRequire } from 'node:module';
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ?? import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2];
const URL = 'http://localhost:4173/';
const errors = [];
const log = (...a) => console.log('•', ...a);
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; } else console.log('✓', m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const nav = (label) => page.locator('nav.nav button', { hasText: label }).click();
const confirmYes = async () => { await page.locator('.modal .btn.primary, .modal .btn.danger').click(); };

await page.goto(URL);
await page.waitForSelector('text=UEFA Şampiyonlar Ligi 2026/27');
await page.screenshot({ path: `${OUT}/01-genel-bakis.png`, fullPage: true });
// Wait MC
await page.waitForFunction(() => document.body.innerText.includes('simülasyon') && !document.body.innerText.includes('olasılıklar hesaplanıyor'), null, { timeout: 30000 });

// 1. Official standings
await nav('Puan Durumu');
await page.locator('.tab', { hasText: 'Resmi tablo' }).click();
const firstRow = await page.locator('table.standings tbody tr').first().innerText();
assert(firstRow.includes('Paris Saint-Germain') && /\b9\b/.test(firstRow), 'Resmi tabloda PSG 1. sırada, 9 puan: ' + firstRow.replace(/\s+/g, ' '));
const fbRowOfficial = await page.locator('table.standings tbody tr', { hasText: 'Fenerbahçe' }).innerText();
log('FB resmi:', fbRowOfficial.replace(/\s+/g, ' '));
const gsRowOfficial = await page.locator('table.standings tbody tr', { hasText: 'Galatasaray' }).innerText();
log('GS resmi:', gsRowOfficial.replace(/\s+/g, ' '));
assert(gsRowOfficial.startsWith('23'), 'Galatasaray resmi tabloda 23. (referansla uyumlu)');
await page.screenshot({ path: `${OUT}/02-puan-durumu.png`, fullPage: true });

// 2. Mode A: enter FB score MD4 (FB-LIV)
await nav('Fenerbahçe & Galatasaray');
await page.locator('select').filter({ hasText: '4. hafta' }).first().selectOption({ label: /4\. hafta: Fenerbahçe – Liverpool/ }).catch(async () => {
  const opts = await page.locator('label.field select option').allInnerTexts();
  const o = opts.find((x) => x.startsWith('4. hafta: Fenerbahçe'));
  await page.locator('label.field select').selectOption({ label: o });
});
await page.getByLabel('Ev sahibi skor').fill('2');
await page.getByLabel('Deplasman skor').fill('1');
await page.locator('button', { hasText: 'Sonucu kaydet' }).click();
await page.waitForTimeout(300);
await nav('Puan Durumu');
await page.locator('.tab', { hasText: 'Güncel senaryo tablosu' }).click();
const fbRow = await page.locator('table.standings tbody tr', { hasText: 'Fenerbahçe' }).innerText();
assert(/\b4\b.*\b1\b.*\b2\b.*\b1\b/.test(fbRow.replace(/\s+/g, ' ')) && fbRow.replace(/\s+/g, ' ').trim().endsWith('') , 'FB satırı güncellendi: ' + fbRow.replace(/\s+/g, ' '));
assert(/\s5\s/.test(' ' + fbRow.replace(/\s+/g, ' ') + ' '), 'FB 5 puana çıktı');

// GS score
await nav('Fenerbahçe & Galatasaray');
const opts = await page.locator('label.field select option').allInnerTexts();
await page.locator('label.field select').selectOption({ label: opts.find((x) => x.startsWith('4. hafta: Galatasaray')) });
await page.getByLabel('Ev sahibi skor').fill('3');
await page.getByLabel('Deplasman skor').fill('0');
await page.locator('button', { hasText: 'Sonucu kaydet' }).click();
await page.waitForTimeout(200);
// Simulate other matches of MD4
await page.locator('button', { hasText: '4. haftanın diğer maçlarını simüle et' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-fb-gs.png`, fullPage: true });

await nav('Maçlar');
const md4 = await page.locator('.tab', { hasText: '4. Hafta' }).innerText();
log('4. hafta sekmesi:', md4.replace(/\s+/g, ' '));
await page.locator('.tab', { hasText: '4. Hafta' }).click();
const fbCard = page.locator('.fixture', { hasText: 'Fenerbahçe' }).first();
assert((await fbCard.innerText()).includes('Elle girildi'), 'FB maçı "Elle girildi" olarak işaretli');
assert(await fbCard.getByLabel('FB gol').inputValue() === '2', 'FB skoru simülasyondan sonra korunuyor (2)');
const simCount = await page.locator('.fixture.fx-simulated').count();
assert(simCount === 16, `4. haftada 16 maç simüle edildi (bulunan ${simCount})`);
await page.screenshot({ path: `${OUT}/04-maclar.png`, fullPage: true });

// Official matches locked
await page.locator('.tab', { hasText: '1. Hafta' }).click();
const offInputs = await page.locator('.fixture.fx-official input').count();
assert(offInputs === 0, 'Resmi maçlarda skor kutusu yok (değiştirilemez)');
assert(await page.locator('.fixture.fx-official').count() === 18, '1. hafta 18 resmi sonuç');

// Undo
await page.locator('.tab', { hasText: '4. Hafta' }).click();
await page.locator('button', { hasText: 'Son değişikliği geri al' }).click();
await page.waitForTimeout(200);
assert(await page.locator('.fixture.fx-simulated').count() === 0, 'Geri al: 4. hafta simülasyonu geri alındı');
assert(await page.locator('.fixture', { hasText: 'Fenerbahçe' }).first().getByLabel('FB gol').inputValue() === '2', 'Geri alma elle girilen FB skorunu korudu');

// Simulate whole season in Mode A: confirm turkish too
await nav('Genel Bakış');
await page.locator('button', { hasText: 'Tüm sezonu tek tıkla simüle et' }).click();
await page.waitForSelector('.modal');
const modalText = await page.locator('.modal').innerText();
assert(modalText.includes('Fenerbahçe/Galatasaray'), 'Mod A tüm sezon: FB/GS maçları için onay soruldu');
await confirmYes();
await page.waitForTimeout(800);
await nav('Turnuva Ağacı');
const champ = await page.locator('[data-testid=champion]').innerText().catch(() => '');
assert(champ.includes('Şampiyon'), 'Şampiyon belirlendi: ' + champ.replace(/\s+/g, ' '));
const ties = await page.locator('.tie').count();
assert(ties === 23, `Eleme ağacında 23 eşleşme (8 PO + 8 Son16 + 4 ÇF + 2 YF + 1 F), bulunan ${ties}`);
await page.screenshot({ path: `${OUT}/05-turnuva-agaci.png`, fullPage: true });
// FB manual score still intact
await nav('Maçlar');
await page.locator('.tab', { hasText: '4. Hafta' }).click();
assert(await page.locator('.fixture', { hasText: 'Fenerbahçe' }).first().getByLabel('FB gol').inputValue() === '2', 'Tüm sezon simülasyonu sonrasında FB elle skoru korunuyor');

// 6. Mode independence: switch to B
await page.locator('.mode-switch button', { hasText: 'Mod B' }).click();
await page.waitForTimeout(300);
await page.locator('.tab', { hasText: '4. Hafta' }).click();
const fbB = await page.locator('.fixture', { hasText: 'Fenerbahçe' }).first().getByLabel('FB gol').inputValue();
assert(fbB === '', 'Mod B: Mod A’da girilen FB skoru görünmüyor (bağımsız)');
const editableB = await page.locator('.fixture .score-input').count();
assert(editableB === 36, `Mod B: 4. haftada tüm 18 maç düzenlenebilir (36 kutu), bulunan ${editableB}`);
// Enter a score for a non-turkish match in mode B
const card = page.locator('.fixture', { hasText: 'Bayern Münih' }).first();
await card.locator('.score-input').nth(0).fill('0');
await card.locator('.score-input').nth(1).fill('4');
await card.locator('button', { hasText: 'Sonucu kaydet' }).click();
await page.waitForTimeout(200);
assert((await card.innerText()).includes('Elle girildi'), 'Mod B: herhangi bir maçın skoru girilebildi');
// Simulate a single match in mode B
await page.locator('.fixture', { hasText: 'Sabah' }).first().locator('button', { hasText: 'Bu maçı simüle et' }).click();
await page.waitForTimeout(200);
assert((await page.locator('.fixture', { hasText: 'Sabah' }).first().innerText()).includes('Simüle edildi'), 'Mod B: tek maç simülasyonu');
await page.screenshot({ path: `${OUT}/06-mod-b.png`, fullPage: true });
// Back to A: still champion
await page.locator('.mode-switch button', { hasText: 'Mod A' }).click();
await nav('Turnuva Ağacı');
assert((await page.locator('[data-testid=champion]').count()) === 1, 'Mod A’ya dönünce turnuva durumu korunmuş');

// 13. Export / reload persistence
await nav('Veri ve Ayarlar');
await page.screenshot({ path: `${OUT}/07-veri-ayarlar.png`, fullPage: true });
const dataTxt = await page.locator('.page').innerText();
assert(dataTxt.includes('birebir uyumlu'), 'Referans tablo doğrulaması gösteriliyor');
assert(dataTxt.includes('Elle içe aktarıldı') || dataTxt.includes('Elle içe aktarıldı / derlendi'), 'Verinin elle derlendiği belirtiliyor');
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Tüm durumu JSON olarak dışa aktar' }).click()]);
const exportPath = `${OUT}/export.json`;
await dl.saveAs(exportPath);
log('dışa aktarıldı');
// Reset simulated
await page.locator('button', { hasText: 'Yalnızca simüle sonuçları sıfırla' }).click();
await confirmYes();
await page.waitForTimeout(300);
await nav('Puan Durumu');
await page.locator('.tab', { hasText: 'Güncel senaryo tablosu' }).click();
const inc = await page.locator('.included').innerText();
assert(/54 resmi \+ 2 elle girilen \+ 0 simüle/.test(inc), 'Simüle sıfırlama: resmi (54) ve elle (2) korundu → ' + inc);
// Reload persistence
await page.reload();
await page.waitForSelector('nav.nav');
await nav('Puan Durumu');
await page.locator('.tab', { hasText: 'Güncel senaryo tablosu' }).click();
assert(/54 resmi \+ 2 elle girilen \+ 0 simüle/.test(await page.locator('.included').innerText()), 'Sayfa yenilemesinden sonra durum korunuyor');
// Import exported state back
await nav('Veri ve Ayarlar');
await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(exportPath);
await page.waitForSelector('.modal');
await confirmYes();
await page.waitForTimeout(500);
await nav('Turnuva Ağacı');
assert((await page.locator('[data-testid=champion]').count()) === 1, 'JSON içe aktarma: şampiyonlu tam sezon geri geldi');

// Probabilities page
await nav('Şampiyonluk Olasılıkları');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/08-olasiliklar.png`, fullPage: true });
await nav('Takım Güçleri');
await page.screenshot({ path: `${OUT}/09-takim-gucleri.png`, fullPage: true });

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const mp = await m.newPage();
mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mp.goto(URL);
await mp.waitForSelector('text=UEFA Şampiyonlar Ligi 2026/27');
const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
assert(sw <= 392, `Mobil: yatay taşma yok (scrollWidth ${sw})`);
await mp.screenshot({ path: `${OUT}/10-mobil-genel.png`, fullPage: false });
await mp.locator('nav.nav button', { hasText: 'Maçlar' }).click();
const sw2 = await mp.evaluate(() => document.documentElement.scrollWidth);
assert(sw2 <= 392, `Mobil maçlar: yatay taşma yok (${sw2})`);
await mp.screenshot({ path: `${OUT}/11-mobil-maclar.png`, fullPage: false });
await mp.locator('nav.nav button', { hasText: 'Fenerbahçe & Galatasaray' }).click();
const sw3 = await mp.evaluate(() => document.documentElement.scrollWidth);
assert(sw3 <= 392, `Mobil FB&GS: yatay taşma yok (${sw3})`);
await mp.screenshot({ path: `${OUT}/12-mobil-fbgs.png`, fullPage: false });

assert(errors.length === 0, 'Konsol/sayfa hatası yok' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
