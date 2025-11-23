// Simple helpers for AniList + fuzzy matching

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Small alias map to cover shorthand or odd phrases
const ALIAS_MAP = {
  aot: 'attack on titan',
  jjk: 'jujutsu kaisen',
  'opm': 'one punch man',
  'mha': 'my hero academia',
  'fma': 'fullmetal alchemist',
}

function applyAlias(input) {
  const normalized = normalize(input)
  return ALIAS_MAP[normalized] ?? input
}

function levenshteinDistance(a, b) {
  if (a === b) return 0

  const aLen = a.length
  const bLen = b.length

  if (aLen === 0) return bLen
  if (bLen === 0) return aLen

  const prevRow = Array.from({ length: bLen + 1 }, (_, i) => i)
  const currRow = new Array(bLen + 1)

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      )
    }
    prevRow.splice(0, prevRow.length, ...currRow)
  }

  return prevRow[bLen]
}

// Normalized Levenshtein similarity (0–1)
function similarity(a, b) {
  const na = normalize(a)
  const nb = normalize(b)

  if (na.length === 0 && nb.length === 0) return 1
  if (na.length === 0 || nb.length === 0) return 0

  const distance = levenshteinDistance(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return 1 - distance / maxLen
}

const GOOGLE_CSE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_API_KEY
const GOOGLE_CSE_CX = import.meta.env.VITE_GOOGLE_CSE_CX

// Call AniList search API
export async function searchAnimeOnAniList(search) {
  const query = `
    query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            medium
          }
          seasonYear
        }
      }
    }
  `

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables: { search } }),
  })

  if (!res.ok) {
    console.error('AniList error', await res.text())
    return []
  }

  const json = await res.json()
  return json.data?.Page?.media ?? []
}

function pickBestTitle(title = '') {
  if (!title) return ''

  return title
    .replace(/\s*[\-|]\s*AniList.*$/i, '')
    .replace(/\s*[\-|]\s*MyAnimeList.*$/i, '')
    .replace(/\s*\|\s*Official Site.*$/i, '')
    .replace(/\s*\(Anime\).*$/i, '')
    .replace(/\s*\(TV\).*$/i, '')
    .trim()
}

// Use Google CSE to refine messy descriptions into a likely anime title
export async function searchGoogleForAnimePhrase(phrase) {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) {
    console.warn('Google CSE env vars missing; skipping refinement')
    return null
  }

  const params = new URLSearchParams({
    key: GOOGLE_CSE_API_KEY,
    cx: GOOGLE_CSE_CX,
    q: `${phrase} anime`,
  })

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`)

    if (!res.ok) {
      console.warn('Google CSE error', await res.text())
      return null
    }

    const data = await res.json()
    const items = data.items ?? []

    if (!items.length) return null

    const sorted = items
      .map((item) => ({
        ...item,
        priority: item.link?.includes('anilist.co')
          ? 3
          : item.link?.includes('myanimelist.net')
            ? 2
            : 1,
      }))
      .sort((a, b) => b.priority - a.priority)

    for (const item of sorted) {
      const title = pickBestTitle(item.title)
      if (title) return title
    }
  } catch (e) {
    console.warn('Google CSE request failed', e)
  }

  return null
}

function scoreCandidates(searchTerm, candidates) {
  if (!candidates.length) {
    return {
      scores: [],
      best: null,
      second: null,
      margin: 0,
    }
  }

  const scores = candidates.map((c) => {
    const titles = [c.title.english, c.title.romaji, c.title.native].filter(Boolean)
    const bestScore = Math.max(...titles.map((t) => similarity(searchTerm, t)))
    return { anime: c, score: bestScore }
  })

  scores.sort((a, b) => b.score - a.score)

  const best = scores[0]
  const second = scores[1] ?? null
  const margin = second ? best.score - second.score : 1

  return { scores, best, second, margin }
}

function formatMatch(raw, scored) {
  if (!scored.scores.length) {
    return {
      raw,
      type: 'no-match',
      candidates: [],
    }
  }

  const AUTO_THRESHOLD = 0.7
  const MARGIN_MIN = 0.2

  if (scored.best.score >= AUTO_THRESHOLD && scored.margin >= MARGIN_MIN) {
    return {
      raw,
      type: 'auto',
      best: scored.best,
      candidates: scored.scores,
    }
  }

  return {
    raw,
    type: 'review',
    best: scored.best,
    candidates: scored.scores,
  }
}

async function performAniListMatch(raw, searchTerm) {
  const candidates = await searchAnimeOnAniList(searchTerm)
  const scored = scoreCandidates(searchTerm, candidates)
  const result = formatMatch(raw, scored)

  return { result, scored }
}

// High-level: given a raw line of text, return match info
export async function matchAnime(rawInput) {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const aliasedInput = applyAlias(trimmed)
  const initial = await performAniListMatch(trimmed, aliasedInput)

  const LOW_CONFIDENCE_THRESHOLD = 0.55
  const hasLowConfidence = !initial.scored.scores.length || (initial.scored.best?.score ?? 0) < LOW_CONFIDENCE_THRESHOLD

  if (!hasLowConfidence) return initial.result

  const refined = await searchGoogleForAnimePhrase(aliasedInput)

  if (!refined || refined.toLowerCase() === aliasedInput.toLowerCase()) {
    return initial.result
  }

  const refinedAttempt = await performAniListMatch(trimmed, refined)
  const refinedBestScore = refinedAttempt.scored.best?.score ?? 0
  const initialBestScore = initial.scored.best?.score ?? 0

  if (refinedBestScore > initialBestScore) {
    return refinedAttempt.result
  }

  return initial.result
}
