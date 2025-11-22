// Simple helpers for AniList + fuzzy matching

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(str) {
  return new Set(normalize(str).split(' ').filter(Boolean))
}

const ALIAS_MAP = {
  jjk: 'Jujutsu Kaisen',
  aot: 'Attack on Titan',
  mha: 'My Hero Academia',
  bnha: 'My Hero Academia',
  opm: 'One Punch Man',
  'demon slayer': 'Kimetsu no Yaiba',
  'kimetsu no yaiba': 'Kimetsu no Yaiba',
  'jujitsu kaisen': 'Jujutsu Kaisen',
}

// Normalized Levenshtein similarity (0–1)
function levenshteinSimilarity(a, b) {
  const aa = normalize(a)
  const bb = normalize(b)

  if (aa.length === 0 || bb.length === 0) return 0

  const rows = aa.length + 1
  const cols = bb.length + 1
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0))

  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }

  const distance = dp[rows - 1][cols - 1]
  const maxLen = Math.max(aa.length, bb.length)
  return 1 - distance / maxLen
}

function combinedSimilarity(a, b) {
  const tokenScore = similarity(a, b)
  const levenshteinScore = levenshteinSimilarity(a, b)
  return Math.max(tokenScore, levenshteinScore)
}

function resolveAlias(rawInput) {
  const normalized = normalize(rawInput)
  return ALIAS_MAP[normalized] || rawInput
}

// Very simple Jaccard similarity on tokens (0–1)
function similarity(a, b) {
  const sa = tokenSet(a)
  const sb = tokenSet(b)

  if (sa.size === 0 || sb.size === 0) return 0

  let intersection = 0
  for (const t of sa) {
    if (sb.has(t)) intersection++
  }
  const union = sa.size + sb.size - intersection
  return intersection / union
}

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

// High-level: given a raw line of text, return match info
export async function matchAnime(rawInput) {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const searchInput = resolveAlias(trimmed)

  const candidates = await searchAnimeOnAniList(searchInput)
  if (!candidates.length) {
    return {
      raw: trimmed,
      type: 'no-match',
      candidates: [],
    }
  }

  // score candidates
  const scores = candidates.map((c) => {
    const titles = [c.title.english, c.title.romaji, c.title.native].filter(Boolean)
    const bestScore = Math.max(...titles.map((t) => combinedSimilarity(searchInput, t)))
    return { anime: c, score: bestScore }
  })

  scores.sort((a, b) => b.score - a.score)

  const best = scores[0]
  const second = scores[1]

  const AUTO_THRESHOLD = 0.7
  const MARGIN_MIN = 0.2

  const margin = second ? best.score - second.score : 1

  if (best.score >= AUTO_THRESHOLD && margin >= MARGIN_MIN) {
    return {
      raw: trimmed,
      type: 'auto',
      best,
      candidates: scores,
    }
  }

  return {
    raw: trimmed,
    type: 'review',
    best,
    candidates: scores,
  }
}
