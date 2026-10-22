// Ortak tipler: veri katmanı, simülasyon motoru ve arayüz bu tipleri paylaşır.

export type TeamId = string;

export interface Team {
  id: TeamId;
  name: string;
  short: string;
  country: string;
  pot: 1 | 2 | 3 | 4;
  /** Torba sırasından türetilen katsayı sırası (vekil). */
  coefficientRank: number;
}

export interface Score {
  home: number;
  away: number;
}

/** Veri setindeki maç durumu. */
export type FixtureStatus = 'official' | 'scheduled' | 'postponed';

export interface Fixture {
  id: string;
  stage: 'league';
  matchday: number;
  date: string | null;
  kickoffCET: string | null;
  home: TeamId;
  away: TeamId;
  status: FixtureStatus;
  score?: Score;
  note?: string;
}

export interface DatasetSource {
  name: string;
  url?: string;
}

export interface ReferenceRow {
  team: TeamId;
  position?: number;
  points?: number;
  goalDifference?: number;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
}

/** Resmi kura yapıldıktan sonra içe aktarılabilecek eleme kurası. */
export interface OfficialDraw {
  /** Play-off eşleşme grubu (I..IV) → [seri başı, seri başı olmayan] çiftleri */
  playoffTies?: Record<string, [TeamId, TeamId][]>;
  /** Son 16 yarısı → slot → takım */
  bracket?: unknown;
}

export interface Dataset {
  schema: string;
  season: string;
  competition: string;
  meta: {
    lastUpdated: string;
    resultsThrough: string;
    retrieval: 'manual' | 'automatic';
    retrievalNote: string;
    sources: DatasetSource[];
    unverified: string[];
  };
  rules: {
    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
    leaguePhaseMatches: number;
    directQualification: [number, number];
    playoffPositions: [number, number];
    eliminatedFrom: number;
    tiebreakers: string[];
    tiebreakersInProgress: number;
    secondLegHome: string;
    awayGoalsRule: boolean;
    extraTimeMinutes: number;
    final: string;
    countryProtectionKnockout: boolean;
    [k: string]: unknown;
  };
  knockoutDraw: OfficialDraw | null;
  referenceStandings: {
    asOf: string;
    note: string;
    sources: string[];
    rows: ReferenceRow[];
  } | null;
  teams: Team[];
  fixtures: Fixture[];
}

/** Bir senaryoda maç sonucunun kaynağı. */
export type ResultSource = 'official' | 'manual' | 'simulated';

export interface ResultEntry extends Score {
  source: 'manual' | 'simulated';
  /** Simüle edilen maçlar için kullanılan tekrar sayacı (yeniden oynatma). */
  nonce?: number;
  updatedAt: number;
}

/** Eleme maçı (tek ayak) sonucu. Uzatma golleri 90 dakikaya EK olarak tutulur. */
export interface KnockoutLegResult extends Score {
  source: 'manual' | 'simulated';
  etHome?: number;
  etAway?: number;
  penHome?: number;
  penAway?: number;
  nonce?: number;
  updatedAt: number;
}

export interface ModelSettings {
  /** Lig ortalaması: maç başı takım gol beklentisi (tarafsız saha). */
  baseGoals: number;
  /** Ev sahibi avantajı (log-ölçek, ev sahibinin gol beklentisine). */
  homeAdvantage: number;
  /** Ev sahibi avantajının deplasman takımına etkisi (log-ölçek, negatif). */
  awayPenalty: number;
  /** Elo puanı başına log-gol etkisi. */
  eloScale: number;
  /** Dixon-Coles düşük skor düzeltmesi (rho). */
  dixonColesRho: number;
  /** Form penceresi (son N maç). */
  formWindow: number;
  /** Formun hücum/savunmaya etkisi (0..1). */
  formWeight: number;
  /** Elo güncelleme katsayısı. */
  eloK: number;
  /** Form hesabında simüle edilen sonuçları dahil et. */
  formUsesSimulated: boolean;
}

export interface TeamRatingOverride {
  /** Elo puanına elle eklenen düzeltme. */
  eloAdjust?: number;
  /** Hücum (log-ölçek) elle düzeltme. */
  attackAdjust?: number;
  /** Savunma (log-ölçek) elle düzeltme; pozitif = daha iyi savunma. */
  defenseAdjust?: number;
}
