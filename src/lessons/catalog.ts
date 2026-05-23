/**
 * Curated seed list of public Lichess studies. Hand-picked to cover the most
 * common openings a beginner / intermediate solo player will run into. Each
 * entry is a real Lichess study — we don't ship the PGN ourselves; users
 * trigger the fetch + import on demand.
 *
 * Adding an entry: find a public study you trust, copy the 8-char slug from
 * the URL (https://lichess.org/study/XXXXXXXX), drop a row below. Keep the
 * list short — this is a starter set, not an exhaustive index. Power users
 * can paste any other study URL in the importer.
 */
export interface CuratedStudy {
  /** Stable catalog id we use to avoid collisions with user imports. */
  key: string;
  /** Lichess study id (slug). */
  studyId: string;
  /** Display name — what we render before the user imports. */
  name: string;
  /** Which side of the board this study is from (informational). */
  side: 'white' | 'black' | 'both';
  /** One-line blurb under the title. */
  blurb: string;
  /** Bucket for grouping in the UI. */
  category: 'fundamentals' | 'openings-white' | 'openings-black' | 'endgames';
  /** Search aliases — opening names that should match this study when the
   *  Analyze view deep-links here. Case-insensitive substring match. */
  matches: string[];
}

export const CURATED_STUDIES: CuratedStudy[] = [
  {
    key: 'chess-fundamentals',
    studyId: '14targuY',
    name: 'Chess Fundamentals',
    side: 'both',
    blurb: 'Capablanca\'s classic — opening principles, pawn structures, basic endgames.',
    category: 'fundamentals',
    matches: [],
  },
  {
    key: 'common-openings',
    studyId: 'aHJlJsx7',
    name: 'Common Opening Traps',
    side: 'both',
    blurb: 'Frequently-played traps every club player should recognize.',
    category: 'fundamentals',
    matches: [],
  },
  {
    key: 'italian-game',
    studyId: 'AjJWZvgM',
    name: 'The Italian Game',
    side: 'white',
    blurb: 'Classical 1.e4 e5 2.Nf3 Nc6 3.Bc4 setups — Giuoco Piano + Evans Gambit.',
    category: 'openings-white',
    matches: ['italian', 'giuoco', 'evans gambit'],
  },
  {
    key: 'ruy-lopez',
    studyId: 'gqkwo6Cu',
    name: 'Ruy Lopez (Spanish)',
    side: 'white',
    blurb: 'Main lines of 1.e4 e5 2.Nf3 Nc6 3.Bb5 — Berlin, Closed, Open.',
    category: 'openings-white',
    matches: ['ruy lopez', 'spanish'],
  },
  {
    key: 'london-system',
    studyId: 'sPb5MMYw',
    name: 'The London System',
    side: 'white',
    blurb: 'Solid 1.d4 + Bf4 setup — easy to learn, hard to refute.',
    category: 'openings-white',
    matches: ['london'],
  },
  {
    key: 'caro-kann',
    studyId: 'fENPxlrR',
    name: 'Caro-Kann Defense',
    side: 'black',
    blurb: '1...c6 vs 1.e4 — main lines through the Exchange, Advance, Classical.',
    category: 'openings-black',
    matches: ['caro-kann', 'caro kann'],
  },
  {
    key: 'sicilian-najdorf',
    studyId: 'lhMNFgN8',
    name: 'Sicilian Najdorf',
    side: 'black',
    blurb: 'The fighter — 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6.',
    category: 'openings-black',
    matches: ['sicilian', 'najdorf'],
  },
  {
    key: 'kings-indian',
    studyId: 'iVWmK1Sx',
    name: "King's Indian Defense",
    side: 'black',
    blurb: 'Hypermodern setup vs 1.d4 — fianchetto and central pawn break.',
    category: 'openings-black',
    matches: ["king's indian", 'kings indian', 'kid'],
  },
  {
    key: 'basic-endgames',
    studyId: 'fhKDQEcM',
    name: 'Essential Endgames',
    side: 'both',
    blurb: 'K+P vs K, Lucena, Philidor, basic rook endings.',
    category: 'endgames',
    matches: [],
  },
];

export const CATEGORY_LABELS: Record<CuratedStudy['category'], string> = {
  fundamentals: 'Fundamentals',
  'openings-white': 'Openings — White',
  'openings-black': 'Openings — Black',
  endgames: 'Endgames',
};

/**
 * Find a curated study by an opening name (case-insensitive substring match
 * against the `matches` field). Used by the Analyze view's deep-link.
 */
export function findStudyByOpeningName(name: string): CuratedStudy | undefined {
  if (!name) return undefined;
  const haystack = name.toLowerCase();
  return CURATED_STUDIES.find((s) => s.matches.some((m) => haystack.includes(m)));
}

export function findStudyByKey(key: string): CuratedStudy | undefined {
  return CURATED_STUDIES.find((s) => s.key === key);
}
