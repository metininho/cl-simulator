// Derleme betiği: elle doğrulanan fikstür/sonuç listesinden src/data/season-2026-27.json üretir.
// Kaynaklar ve doğrulama notları dataset içine yazılır. Sonuçlar burada değiştirilmeli, JSON elle değil.
import { writeFileSync } from 'node:fs';

const teams = [
  // [id, name, short, country, pot]  — torba içi sıralama kaynaklardaki (ESPN/SI) listeleme sırasıdır
  ['PSG', 'Paris Saint-Germain', 'PSG', 'FRA', 1], ['BAY', 'Bayern Münih', 'BAY', 'GER', 1],
  ['RMA', 'Real Madrid', 'RMA', 'ESP', 1], ['LIV', 'Liverpool', 'LIV', 'ENG', 1],
  ['INT', 'Inter', 'INT', 'ITA', 1], ['MCI', 'Manchester City', 'MCI', 'ENG', 1],
  ['ARS', 'Arsenal', 'ARS', 'ENG', 1], ['BAR', 'Barcelona', 'BAR', 'ESP', 1],
  ['ATM', 'Atlético Madrid', 'ATM', 'ESP', 1],
  ['BVB', 'Borussia Dortmund', 'BVB', 'GER', 2], ['ROM', 'Roma', 'ROM', 'ITA', 2],
  ['SCP', 'Sporting CP', 'SCP', 'POR', 2], ['AVL', 'Aston Villa', 'AVL', 'ENG', 2],
  ['POR', 'Porto', 'POR', 'POR', 2], ['MUN', 'Manchester United', 'MUN', 'ENG', 2],
  ['CLB', 'Club Brugge', 'CLB', 'BEL', 2], ['BET', 'Real Betis', 'BET', 'ESP', 2],
  ['PSV', 'PSV Eindhoven', 'PSV', 'NED', 2],
  ['FEY', 'Feyenoord', 'FEY', 'NED', 3], ['LIL', 'Lille', 'LIL', 'FRA', 3],
  ['NAP', 'Napoli', 'NAP', 'ITA', 3], ['RBL', 'RB Leipzig', 'RBL', 'GER', 3],
  ['VIL', 'Villarreal', 'VIL', 'ESP', 3], ['SHA', 'Şahtar Donetsk', 'SHA', 'UKR', 3],
  ['GS', 'Galatasaray', 'GS', 'TUR', 3], ['FB', 'Fenerbahçe', 'FB', 'TUR', 3],
  ['BOD', 'Bodø/Glimt', 'BOD', 'NOR', 3],
  ['SLA', 'Slavia Prag', 'SLA', 'CZE', 4], ['SLO', 'Slovan Bratislava', 'SLO', 'SVK', 4],
  ['STU', 'Stuttgart', 'STU', 'GER', 4], ['AEK', 'AEK Atina', 'AEK', 'GRE', 4],
  ['LASK', 'LASK', 'LASK', 'AUT', 4], ['COM', 'Como', 'COM', 'ITA', 4],
  ['RCL', 'Lens', 'RCL', 'FRA', 4], ['VIK', 'Viking', 'VIK', 'NOR', 4],
  ['SAB', 'Sabah', 'SAB', 'AZE', 4],
];

// md, date, kickoff (CET, null = doğrulanmadı), home, away, score|null, note
const F = [];
const add = (md, date, ko, list) => list.forEach(([h, a, s, note]) => F.push({ md, date, ko, h, a, s, note }));

// MD1 — 8–10 Eylül 2026 (UEFA.com, worldfootball.net, NBC Sports; çelişki yok)
add(1, '2026-09-08', null, [['AEK','LASK','1-0'],['CLB','AVL','2-3'],['BVB','VIL','3-2'],['POR','MCI','0-2'],['LIL','BET','2-3'],['RMA','INT','2-1']]);
add(1, '2026-09-09', null, [['BAR','FEY','5-1'],['STU','VIK','3-1'],['LIV','ATM','2-1'],['PSG','SLO','6-1'],['SCP','GS','3-1'],['NAP','ARS','0-1']]);
add(1, '2026-09-10', null, [['FB','ROM','1-1'],['PSV','SHA','1-1'],['COM','RBL','4-1'],['BAY','BOD','5-0'],['MUN','SAB','4-0'],['SLA','RCL','2-3']]);
// MD2 — 13–14 Ekim 2026 (UEFA.com, NBC, CBS, worldfootball.net)
add(2, '2026-10-13', null, [['RCL','SCP','0-2'],['SAB','SLA','2-0'],['ARS','LIL','3-0'],['ATM','MUN','2-0'],['INT','CLB','3-4'],['GS','BAR','1-4'],['RBL','PSV','1-0'],['VIK','BAY','3-3'],['VIL','NAP','3-1']]);
add(2, '2026-10-14', null, [['FEY','COM','3-2'],['LASK','LIV','3-6'],['ROM','RMA','3-4'],['AVL','FB','6-0'],['SHA','AEK','3-1'],['BOD','BVB','1-0'],['MCI','PSG','2-4'],['BET','POR','3-2'],['SLO','STU','0-3']]);
// MD3 — 20–21 Ekim 2026
add(3, '2026-10-20', null, [
  ['FB','SLA','2-2','Bir kaynak 2-1 bildirdi; UEFA.com ve diğer kaynaklar 2-2. 2-2 kabul edildi.'],
  ['SAB','BVB','1-2'],['ROM','SLO','4-0'],['POR','PSV','0-1'],['LIV','VIL','4-3'],['MCI','AEK','5-1'],
  ['PSG','BAR','4-2','Bir kaynak 5-2 bildirdi; UEFA.com ve PSG kaynakları 4-2. 4-2 kabul edildi.'],
  ['NAP','BOD','4-3'],['STU','ATM','1-1']]);
add(3, '2026-10-21', null, [['COM','MUN','4-1'],['LIL','GS','2-4'],['BAY','ARS','2-2'],['AVL','VIK','3-1'],['CLB','RCL','3-0'],['RMA','RBL','4-1'],['INT','SHA','1-0'],['BET','FEY','1-0'],['SCP','LASK','2-3']]);
// MD4 — 3–4 Kasım 2026 (saatler UEFA.com/NBC/Dongqiudi ile tutarlı)
add(4, '2026-11-03', '18:45', [['SHA','SCP',null],['GS','STU',null]]);
add(4, '2026-11-03', '21:00', [['ATM','BAY',null],['BAR','AVL',null],['FEY','INT',null],['BOD','LIL',null],['LASK','SLO',null],['MUN','ROM',null],['VIL','PSG',null]]);
add(4, '2026-11-04', '18:45', [['AEK','RMA',null],['FB','LIV',null]]);
add(4, '2026-11-04', '21:00', [['BVB','BET',null],['POR','NAP',null],['PSV','CLB',null],['RBL','MCI',null],['RCL','COM',null],['SLA','ARS',null],['VIK','SAB',null]]);
// MD5 — 24–25 Kasım 2026 (başlama saatleri maç bazında doğrulanamadı)
add(5, '2026-11-24', null, [['BOD','LASK',null],['GS','AVL',null],['ARS','BVB',null],['COM','AEK',null],['FEY','POR',null],['MCI','NAP',null],['RBL','RCL',null],['RMA','PSV',null],['SLO','BET',null]]);
add(5, '2026-11-25', null, [['SAB','BAR',null],['SLA','VIL',null],['ATM','VIK',null],['CLB','LIV',null],['INT','STU',null],['SHA','FB',null],['LIL','BAY',null],['PSG','ROM',null],['SCP','MUN',null]]);
// MD6 — 8–9 Aralık 2026
add(6, '2026-12-08', null, [['VIK','FEY',null],['VIL','SAB',null],['AEK','GS',null],['ROM','SCP',null],['AVL','PSG',null],['BAR','MCI',null],['BAY','SLA',null],['MUN','RBL',null],['NAP','CLB',null]]);
add(6, '2026-12-09', null, [['BET','COM',null],['SLO','SHA',null],['ARS','RMA',null,'Real Madrid resmi sitesi 21:00 CET bildiriyor.'],['BVB','INT',null],['LASK','FB',null],['LIV','POR',null],['PSV','ATM',null],['RCL','BOD',null],['STU','LIL',null]]);
// MD7 — 19–20 Ocak 2027
add(7, '2027-01-19', null, [['BOD','ATM',null],['GS','FEY',null],['AEK','ROM',null],['AVL','BVB',null],['INT','LIV',null],['POR','SLA',null],['LIL','SLO',null],['RMA','LASK',null],['STU','CLB',null]]);
add(7, '2027-01-20', null, [['FB','VIL',null],['SAB','NAP',null],['COM','PSG',null],['MUN','BAY',null],['RBL','SHA',null],['RCL','MCI',null],['BET','ARS',null],['SCP','BAR',null],['VIK','PSV',null]]);
// MD8 — 27 Ocak 2027, tüm maçlar aynı saatte
add(8, '2027-01-27', '21:00', [['ARS','SAB',null],['ROM','LIL',null],['ATM','FB',null],['BVB','AEK',null],['CLB','BOD',null],['BAY','BET',null],['BAR','COM',null],['SHA','RMA',null],['FEY','RBL',null],['LASK','POR',null],['LIV','RCL',null],['MCI','SCP',null],['PSG','GS',null],['PSV','STU',null],['SLA','AVL',null],['NAP','VIK',null],['VIL','MUN',null],['SLO','INT',null]]);

const counters = {};
const fixtures = F.map((f) => {
  counters[f.md] = (counters[f.md] ?? 0) + 1;
  const id = `LP-MD${f.md}-${String(counters[f.md]).padStart(2, '0')}`;
  const fx = { id, stage: 'league', matchday: f.md, date: f.date, kickoffCET: f.ko, home: f.h, away: f.a, status: f.s ? 'official' : 'scheduled' };
  if (f.s) { const [hg, ag] = f.s.split('-').map(Number); fx.score = { home: hg, away: ag }; }
  if (f.note) fx.note = f.note;
  return fx;
});

const dataset = {
  schema: 'ucl-dataset/1',
  season: '2026/27',
  competition: 'UEFA Şampiyonlar Ligi',
  meta: {
    lastUpdated: '2026-10-22T07:30:00+03:00',
    resultsThrough: '3. Hafta (21 Ekim 2026)',
    retrieval: 'manual',
    retrievalNote: 'Bu ortamda UEFA.com ve Wikipedia sayfalarına doğrudan (programatik) erişim engelliydi. Veriler web araması sonuç özetlerinden derlendi ve birden fazla kaynakla çapraz kontrol edildi. Otomatik canlı veri bağlantısı yoktur.',
    sources: [
      { name: 'UEFA.com — 2026/27 lig aşaması fikstür ve sonuçları', url: 'https://www.uefa.com/uefachampionsleague/news/02a8-2174c9e9019d-f909a77bd77a-1000--2026-27-champions-league-all-the-league-phase-fixtures-a/' },
      { name: 'UEFA — Lig aşaması kura sonuçları (hafta hafta takvim, PDF)', url: 'https://editorial.uefa.com/resources/02a8-21768bda71f7-297d2c258d74-1000/uefa_-_champions_league_-_2026-27_-_league_phase_draw_results_-_calendar_by_matchday.pdf' },
      { name: 'UEFA Şampiyonlar Ligi 2026/27 Talimatı, Madde 19 (eleme kura sistemi)', url: 'https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-19-Draw-system-knockout-phase-Online' },
      { name: 'NBC Sports — lig aşaması programı ve skorlar', url: 'https://www.nbcsports.com/soccer/news/uefa-champions-league-2026-27-league-phase-schedule-scores-how-to-watch-live' },
      { name: 'worldfootball.net — tüm maçlar', url: 'https://www.worldfootball.net/competition/co19/uefa-champions-league/all-matches/' },
      { name: 'ESPN / SI — 2026/27 torbalar', url: 'https://www.si.com/soccer/2026-27-champions-league-draw-confirmed-league-phase-pots' },
      { name: 'Pulse / Withinnigeria — 3. hafta sonrası puan durumu (kısmi)', url: 'https://www.withinnigeria.com/2026/10/22/champions-league-table-after-matchday-3-psg-top-as-villa-liverpool-real-madrid-and-betis-stay-perfect/' },
    ],
    unverified: [
      '1.–3. hafta ve 5.–7. hafta maçlarının başlama saatleri maç bazında doğrulanamadı (yalnızca tarih var).',
      'Torba içindeki takım sırası UEFA kulüp katsayısı sırası olarak kabul edildi; resmi katsayı puanları veri setinde yok.',
      'Eleme turu (play-off, son 16 vb.) tarihleri doğrulanmadı; bir kaynak play-off için 16–17 ve 23–24 Şubat 2027 veriyor.',
      'Disiplin puanları (eşitlik kriteri 9) verisi yok.',
      'Resmi tam puan tablosu (1–36) tek bir kaynaktan elde edilemedi; doğrulama kısmi referans tabloyla yapılır.',
      'Gol beklentisi (xG), yurt içi lig formu ve kadro/sakatlık verisi yok.',
    ],
  },
  rules: {
    pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
    leaguePhaseMatches: 8,
    directQualification: [1, 8],
    playoffPositions: [9, 24],
    eliminatedFrom: 25,
    tiebreakers: ['goalDifference','goalsFor','awayGoalsFor','wins','awayWins','opponentsPoints','opponentsGoalDifference','opponentsGoalsFor','disciplinaryPoints','clubCoefficient'],
    tiebreakersInProgress: 5,
    playoffPairings: [[[9,10],[23,24]],[[11,12],[21,22]],[[13,14],[19,20]],[[15,16],[17,18]]],
    roundOf16Slots: { A: { seeds: [1,2], playoff: 'IV' }, B: { seeds: [3,4], playoff: 'III' }, C: { seeds: [5,6], playoff: 'II' }, D: { seeds: [7,8], playoff: 'I' } },
    quarterFinals: [['A','D'],['B','C']],
    secondLegHome: 'Play-off: 9–16. sıradaki takım; Son 16: ilk 8; Çeyrek ve yarı final: lig aşamasında daha üst sırada bitiren takım (UEFA 2026/27 Talimatı Md. 19).',
    awayGoalsRule: false,
    extraTimeMinutes: 30,
    final: 'Tek maç, tarafsız saha; beraberlikte uzatma ve penaltılar.',
    countryProtectionKnockout: false,
  },
  knockoutDraw: null,
  referenceStandings: {
    asOf: '3. Hafta sonu (21–22 Ekim 2026)',
    note: 'Kısmi referans: kaynaklarda bulunan değerler. Tam resmi tablo erişilemedi.',
    sources: ['Pulse.com.gh (21.10.2026)', 'Withinnigeria (22.10.2026)', 'FootRankings / X (22.10.2026)', 'NBC Sports'],
    rows: [
      { team: 'PSG', points: 9, goalDifference: 9, position: 1 },
      { team: 'AVL', points: 9 }, { team: 'LIV', points: 9, goalDifference: 5 },
      { team: 'RMA', points: 9 }, { team: 'BET', points: 9 },
      { team: 'STU', points: 7 }, { team: 'ARS', points: 7 },
      { team: 'BAR', points: 6, goalDifference: 5 }, { team: 'MCI', points: 6, goalDifference: 4 },
      { team: 'BVB', goalDifference: 1 }, { team: 'BAY', goalDifference: 5 }, { team: 'ROM', goalDifference: 3 },
      { team: 'ATM', goalDifference: 1 }, { team: 'SHA', goalDifference: 1 }, { team: 'PSV', goalDifference: 0 },
      { team: 'VIL', goalDifference: 0 }, { team: 'INT', goalDifference: -1 }, { team: 'MUN', goalDifference: -1 },
      { team: 'NAP', goalDifference: -2 }, { team: 'GS', points: 3, goalDifference: -3, played: 3, wins: 1, draws: 0, losses: 2, position: 23 },
    ],
  },
  teams: teams.map(([id, name, short, country, pot], i) => ({ id, name, short, country, pot, coefficientRank: i + 1 })),
  fixtures,
};

writeFileSync(new URL('../src/data/season-2026-27.json', import.meta.url), JSON.stringify(dataset, null, 2) + '\n');
console.log(`teams=${teams.length} fixtures=${fixtures.length} official=${fixtures.filter(f=>f.score).length}`);
