/**
 * Curated seed list of public Lichess studies. Hand-picked to cover the most
 * common openings a beginner / intermediate solo player will run into. Each
 * entry is a real Lichess study - we don't ship the PGN ourselves; users
 * trigger the fetch + import on demand.
 *
 * Adding an entry: find a public study you trust, copy the 8-char slug from
 * the URL (https://lichess.org/study/XXXXXXXX), drop a row below. Keep the
 * list short - this is a starter set, not an exhaustive index. Power users
 * can paste any other study URL in the importer.
 */
export interface CuratedStudy {
  /** Stable catalog id we use to avoid collisions with user imports. */
  key: string;
  /** Lichess study id (slug). */
  studyId: string;
  /** Display name - what we render before the user imports. */
  name: string;
  /** Author / curator on Lichess. Surfaced so users know who maintains it. */
  author?: string;
  /** Which side of the board this study is from (informational). */
  side: 'white' | 'black' | 'both';
  /** One-line blurb under the title. */
  blurb: string;
  /** Bucket for grouping in the UI. */
  category: 'fundamentals' | 'openings-white' | 'openings-black' | 'endgames';
  /** Search aliases - opening names that should match this study when the
   *  Analyze view deep-links here. Case-insensitive substring match. */
  matches: string[];
}

/**
 * Seed list of popular public Lichess studies. Slugs pulled from
 * lichess.org/study/all/popular and verified against
 * https://lichess.org/api/study/{id}.pgn - each returns HTTP 200 as of
 * the time these were imported.
 *
 * Titles are cleaned (emojis stripped) for consistent display. Authors
 * are surfaced so users know who curates each study.
 *
 * Refresh procedure: re-run `curl -s https://lichess.org/study/all/popular
 * | grep -oE 'href="/study/[A-Za-z0-9]{8}"'` and update slugs that have
 * fallen out of the popular list.
 */
export const CURATED_STUDIES: CuratedStudy[] = [
  // Fundamentals - broad guides, traps, study plans
  {
    key: 'ideal-opening',
    studyId: 'bbxmDYZV',
    name: 'What is your Ideal Opening?',
    author: 'LeninPerez',
    side: 'both',
    blurb: 'Pick the right opening for your level - beginner, intermediate, advanced paths.',
    category: 'fundamentals',
    matches: [],
  },
  {
    key: 'study-plan-mastery',
    studyId: '1POKgJWJ',
    name: 'Study Plan - Road to Mastery',
    author: 'MagicalzDragonz',
    side: 'both',
    blurb: 'Structured improvement plan with puzzles, openings, and middlegame ideas.',
    category: 'fundamentals',
    matches: [],
  },
  {
    key: 'stafford-traps',
    studyId: 'whCVdUeM',
    name: 'Stafford Gambit Traps',
    author: 'IM EricRosen',
    side: 'black',
    blurb: 'IM Eric Rosen\'s famous Stafford Gambit traps for 1.e4 e5 2.Nf3 Nf6.',
    category: 'fundamentals',
    matches: ['stafford'],
  },

  // White openings
  {
    key: 'italian-opening',
    studyId: 'vJsZScnC',
    name: 'Italian Opening',
    author: 'LeninPerez',
    side: 'white',
    blurb: 'Giuoco Piano, Greco Attack, Giuoco Pianissimo - classical 1.e4 e5 2.Nf3 Nc6 3.Bc4 lines.',
    category: 'openings-white',
    matches: ['italian', 'giuoco', 'evans gambit'],
  },
  {
    key: 'ruy-lopez',
    studyId: 'ZkCxh0nB',
    name: 'Ruy Lopez',
    author: 'LeninPerez',
    side: 'white',
    blurb: 'Exchange and Morphy Defense (closed + open) - the Spanish main lines.',
    category: 'openings-white',
    matches: ['ruy lopez', 'spanish'],
  },
  {
    key: 'london-system',
    studyId: 'vIEKP8t3',
    name: 'The London System',
    author: 'LeninPerez',
    side: 'white',
    blurb: 'Solid 1.d4 + Bf4 setup - formation, principal line.',
    category: 'openings-white',
    matches: ['london'],
  },
  {
    key: 'london-ideas',
    studyId: 'KjivNw7F',
    name: 'Ideas in the London System',
    author: 'FunnyAnimatorJimTV',
    side: 'white',
    blurb: 'Plans + kingside crashes from the London - pairs well with the LeninPerez study.',
    category: 'openings-white',
    matches: ['london'],
  },
  {
    key: 'queens-gambit',
    studyId: 'rMrAjlAG',
    name: "The Queen's Gambit",
    author: 'Yonushke',
    side: 'white',
    blurb: 'Queen\'s Gambit Accepted and Declined - main lines and traps.',
    category: 'openings-white',
    matches: ["queen's gambit", 'queens gambit', 'qgd', 'qga'],
  },
  {
    key: 'e4-repertoire',
    studyId: '4JQtS6iu',
    name: 'Repertoire for 1.e4 players',
    author: 'LeninPerez',
    side: 'white',
    blurb: 'Italian, Ruy Lopez, Scotch - a complete 1.e4 repertoire pack.',
    category: 'openings-white',
    matches: [],
  },

  // Black openings
  {
    key: 'caro-kann',
    studyId: 'jtlLwUvh',
    name: 'Caro-Kann Defense',
    author: 'LeninPerez',
    side: 'black',
    blurb: 'Advance, Exchange, and Panov Attack - the solid 1...c6 reply to 1.e4.',
    category: 'openings-black',
    matches: ['caro-kann', 'caro kann'],
  },
  {
    key: 'sicilian-all',
    studyId: '8c8bmUfy',
    name: 'All about the Sicilian Defense',
    author: 'francesco_super',
    side: 'black',
    blurb: 'Dragon, Yugoslav Attack, Accelerated Dragon - a broad Sicilian tour.',
    category: 'openings-black',
    matches: ['sicilian', 'dragon', 'najdorf'],
  },
  {
    key: 'french-defense',
    studyId: 'UzKIIAtz',
    name: 'French Defense',
    author: 'LeninPerez',
    side: 'black',
    blurb: 'Exchange and Advance Variations - fundamentals of 1...e6 vs 1.e4.',
    category: 'openings-black',
    matches: ['french'],
  },
  {
    key: 'kings-indian',
    studyId: '9XAhbaE7',
    name: "King's Indian: Fantastic Opening",
    author: 'FunnyAnimatorJimTV',
    side: 'black',
    blurb: "Classical Variation main line + kingside attack - Black's hypermodern weapon vs 1.d4.",
    category: 'openings-black',
    matches: ["king's indian", 'kings indian', 'kid'],
  },
];

export const CATEGORY_LABELS: Record<CuratedStudy['category'], string> = {
  fundamentals: 'Fundamentals',
  'openings-white': 'Openings - White',
  'openings-black': 'Openings - Black',
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

/**
 * Does a catalog entry match a free-text query? Case-insensitive substring
 * against name + author + blurb + each opening-name alias. Empty query
 * matches everything (page shows the full catalog).
 */
export function studyMatchesQuery(entry: CuratedStudy, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entry.name.toLowerCase().includes(q)) return true;
  if (entry.author?.toLowerCase().includes(q)) return true;
  if (entry.blurb.toLowerCase().includes(q)) return true;
  return entry.matches.some((m) => m.includes(q));
}
