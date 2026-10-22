# UEFA Şampiyonlar Ligi 2026/27 Simülatörü

Gerçek 2026/27 Şampiyonlar Ligi verileriyle çalışan etkileşimli simülatör (React + TypeScript + Vite).
Arayüz tamamen Türkçedir.

## Çalıştırma

```bash
npm install
npm run dev        # geliştirme sunucusu: http://localhost:5173
npm test           # birim testleri (Vitest)
npm run build      # tip denetimi + üretim derlemesi (dist/)
npm run preview    # derlenmiş sürümü sunar: http://localhost:4173
```

Uçtan uca tarayıcı testleri (Playwright gerekir, `npm run preview` açıkken):

```bash
PLAYWRIGHT_MODULE_DIR=/path/to/node_modules/ node e2e/e2e.mjs /tmp/ekran-goruntuleri
node e2e/e2e2.mjs /tmp/ekran-goruntuleri
```

## Oyun modları

- **Mod A — Türk takımları + otomatik:** Fenerbahçe ve Galatasaray maçlarının skorunu siz girersiniz; diğer maçlar modelle simüle edilir.
- **Mod B — Tam manuel:** Tüm maçların skorunu siz girersiniz; simülasyon tek maç / hafta / kalan tüm maçlar için isteğe bağlıdır.

Her modun senaryoları, sonuçları, tohumu, ayarları, eleme sonuçları ve ilerlemesi **ayrı** saklanır (tarayıcı localStorage).
Her modda birden çok adlandırılmış senaryo oluşturulabilir, çoğaltılabilir, yeniden adlandırılabilir ve kayıtlı sürümlere geri dönülebilir.

## Veri

- `src/data/season-2026-27.json` — 36 takım, 144 lig maçı, 1–3. haftaların 54 resmi sonucu (21 Ekim 2026'ya kadar), kurallar ve kısmi referans puan tablosu.
- `scripts/build-dataset.mjs` — veri setinin kaynağı (sonuçlar burada güncellenip `npm run data:build` çalıştırılır).
- Uygulama içinden JSON veya CSV ile yeni resmi veri seti içe aktarılabilir (yeniden derleme gerekmez); resmi sonuç çakışmaları ve elle girilen sonuçlarla çakışmalar onaydan önce listelenir.
- Veriler web araması sonuçlarından **elle derlenmiştir** (geliştirme ortamında UEFA.com'a doğrudan erişim yoktu) ve birden fazla kaynakla çapraz kontrol edilmiştir.
  Resmi sonuçlardan hesaplanan tablo, yayımlanmış kısmi referans tabloyla (puan/averaj/sıra, 30+ değer) birebir uyuşmaktadır.
  **Canlı veri bağlantısı yoktur.**

## Modüller

| Modül | Görev |
|---|---|
| `src/engine/standings.ts` | Puan durumu, UEFA eşitlik kriterleri, matematiksel kesinlik |
| `src/engine/validation.ts` | Veri seti/fikstür doğrulama, referans tablo karşılaştırması |
| `src/engine/ratings.ts` | Elo tabanlı güç + form modeli |
| `src/engine/model.ts` | Poisson + Dixon-Coles skor modeli, uzatma, penaltı |
| `src/engine/knockout.ts` | Play-off / Son 16 / ÇF / YF / Final ağacı ve kura kuralları |
| `src/engine/season.ts` | Senaryo durumu, simülasyon sınırları (resmi/elle sonuçlar korunur) |
| `src/engine/montecarlo.ts` | Monte Carlo olasılıkları (Web Worker'da) |
| `src/state/*` | Kalıcılık, senaryolar, sürümler, geri alma, içe/dışa aktarma |
| `src/data/provider.ts` | Veri sağlayıcı arayüzü (paket, dosya, URL) |
| `src/ui/*` | Arayüz |

## Bilinen sınırlamalar

- Takım güçleri resmi istatistik değildir: başlangıç Elo'su UEFA katsayı sırasının vekili olan torba sırasından türetilir, bu sezonun sonuçlarıyla güncellenir. xG, yurt içi lig formu, kadro/sakatlık verisi yoktur (elle düzeltme yapılabilir).
- Eşitlik kriteri 9 (disiplin puanı) verisi yoktur ve atlanır; kriter 10 (kulüp katsayısı) torba sırası vekiliyle uygulanır.
- 1–3 ve 5–7. haftaların başlama saatleri maç bazında doğrulanamadı; eleme turu tarihleri doğrulanmadı.
- Eleme kurası henüz çekilmediği için kura seçimleri resmi kurallara uygun şekilde tohumdan üretilir; resmi kura çekildiğinde veri setinin `knockoutDraw` alanıyla eklenebilir.
