import { useEffect, useState } from 'react'
import { matchAnime } from './anilist'

const STORAGE_KEY = 'animeList_v0'
const QUEUE_KEY = 'animeQueue_v0'

function getLocalStorage() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function loadFromStorage(key, fallback) {
  const storage = getLocalStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveToStorage(key, value) {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('Unable to persist data to localStorage', e)
  }
}

function App() {
  const [inputText, setInputText] = useState('')
  const [animeList, setAnimeList] = useState([])
  const [queue, setQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [storageHealthy, setStorageHealthy] = useState(true)

  useEffect(() => {
    const storage = getLocalStorage()

    if (!storage) {
      setStorageHealthy(false)
      return
    }

    setAnimeList(loadFromStorage(STORAGE_KEY, []))
    setQueue(loadFromStorage(QUEUE_KEY, []))
  }, [])

  useEffect(() => {
    saveToStorage(STORAGE_KEY, animeList)
  }, [animeList])

  useEffect(() => {
    saveToStorage(QUEUE_KEY, queue)
  }, [queue])

  async function handleProcess() {
    const lines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (!lines.length) return

    setIsProcessing(true)

    const results = []
    for (const line of lines) {
      try {
        const r = await matchAnime(line)
        if (r) results.push(r)
      } catch (e) {
        console.error('Error matching', line, e)
      }
    }

    const newList = [...animeList]
    const newQueue = [...queue]

    for (const r of results) {
      if (r.type === 'auto' && r.best?.anime) {
        const a = r.best.anime
        if (!newList.some((x) => x.id === a.id)) {
          newList.push({
            id: a.id,
            title: a.title.english || a.title.romaji || a.title.native,
            seasonYear: a.seasonYear,
            cover: a.coverImage?.medium,
            rawInput: r.raw,
          })
        }
      } else {
        newQueue.push(r)
      }
    }

    setAnimeList(newList)
    setQueue(newQueue)
    setIsProcessing(false)
  }

  function handleApprove(queueIndex, candidateIndex = 0) {
    const item = queue[queueIndex]
    const pick = item.candidates[candidateIndex]
    if (!pick) return

    const a = pick.anime

    if (!animeList.some((x) => x.id === a.id)) {
      const newList = [
        ...animeList,
        {
          id: a.id,
          title: a.title.english || a.title.romaji || a.title.native,
          seasonYear: a.seasonYear,
          cover: a.coverImage?.medium,
          rawInput: item.raw,
        },
      ]
      setAnimeList(newList)
    }

    const newQueue = [...queue]
    newQueue.splice(queueIndex, 1)
    setQueue(newQueue)
  }

  function handleDiscard(queueIndex) {
    const newQueue = [...queue]
    newQueue.splice(queueIndex, 1)
    setQueue(newQueue)
  }

  return (
    <div className="page">
      <header className="header">
        <div className="title-group">
          <span className="pill">AniList Helper</span>
          <h1 className="app-title">Build your anime queue effortlessly</h1>
          <p className="app-subtitle">
            Paste titles, let the matcher auto-approve confident finds, and quickly resolve any
            ambiguous results.
          </p>
        </div>
      </header>

      {!storageHealthy && (
        <div className="warning">
          Storage is disabled in this browser, so your list won&apos;t be saved across refreshes.
        </div>
      )}

      <div className="layout">
        {/* Left: input */}
        <div className="card input-card">
          <div className="section-title">Paste anime names</div>
          <p className="input-label">One title per line. We&apos;ll match and add them for you.</p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'one punch man\njjk\nattack on titan\nre zero season 2'}
            className="textarea"
          />
          <button className="button" onClick={handleProcess} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Process input'}
          </button>
        </div>

        {/* Right: lists */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* My List */}
          <section className="card">
            <h2 className="section-title">✅ My Anime List ({animeList.length})</h2>
            {animeList.length === 0 && <p className="empty-state">Nothing yet. Add some anime!</p>}
            <div className="list-grid">
              {animeList.map((a) => (
                <div key={a.id} className="anime-card">
                  {a.cover && <img src={a.cover} alt={a.title} className="anime-cover" />}
                  <div className="anime-title">{a.title}</div>
                  <div className="anime-meta">{a.seasonYear || '—'}</div>
                  <div className="anime-meta">From: {a.rawInput}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Queue */}
          <section className="card">
            <h2 className="section-title">❓ Needs Review ({queue.length})</h2>
            {queue.length === 0 && <p className="empty-state">No ambiguous results right now.</p>}
            <div className="queue-list">
              {queue.map((item, idx) => (
                <div key={idx} className="queue-card">
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                    <span className="input-label">Input:</span> <code>{item.raw}</code>
                  </div>
                  {item.candidates.length === 0 ? (
                    <div className="empty-state">No candidates found.</div>
                  ) : (
                    <div className="candidates">
                      {item.candidates.slice(0, 3).map((c, cIdx) => {
                        const anime = c.anime
                        const title = anime.title.english || anime.title.romaji || anime.title.native
                        return (
                          <div key={cIdx} className="candidate-card">
                            {anime.coverImage?.medium && (
                              <img
                                src={anime.coverImage.medium}
                                alt={title}
                                className="anime-cover"
                                style={{ marginBottom: '0.35rem' }}
                              />
                            )}
                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{title}</div>
                            <div className="anime-meta">Score: {c.score.toFixed(2)}</div>
                            <button className="confirm" onClick={() => handleApprove(idx, cIdx)}>
                              Confirm
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <button className="discard" onClick={() => handleDiscard(idx)}>
                    Discard
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
