import { useEffect, useState } from 'react'
import './App.css'
import { NorwayMap } from './components/NorwayMap'
import {
  averageDistanceKm,
  distanceToScore,
  formatDistanceKm,
  haversineDistanceKm,
  shuffleItems,
  sumScores,
} from './lib/game'
import type { BunadEntry, Coordinates, NorwayGeoJson, RoundResult } from './types'

const BUNAD_DATA_URL = '/bunader/bunads.json'
const MAP_DATA_URL = '/Norge-L.geojson'
const DECORATIVE_FLAG_COUNT = 6

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`)
  }

  return (await response.json()) as T
}

function isCoordinates(value: unknown): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function isBunadEntry(value: unknown): value is BunadEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as Record<string, unknown>

  return (
    typeof entry.id === 'string' &&
    typeof entry.label === 'string' &&
    typeof entry.place === 'string' &&
    typeof entry.image === 'string' &&
    isCoordinates(entry.coordinates)
  )
}

function parseBunadEntries(value: unknown): BunadEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Expected /bunader/bunads.json to contain at least one bunad entry.')
  }

  if (!value.every(isBunadEntry)) {
    throw new Error(
      'Invalid bunad data. Each entry must include id, label, place, image, and coordinates.',
    )
  }

  return value
}

function NorwayFlag({ className = '', delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 16"
      aria-hidden="true"
      focusable="false"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <rect width="22" height="16" rx="1.5" fill="#ba0c2f" />
      <rect x="6" width="4" height="16" fill="#ffffff" />
      <rect y="6" width="22" height="4" fill="#ffffff" />
      <rect x="7" width="2" height="16" fill="#00205b" />
      <rect y="7" width="22" height="2" fill="#00205b" />
    </svg>
  )
}

function CelebrationRibbon({ compact = false }: { compact?: boolean }) {
  const flags = Array.from({ length: compact ? 3 : DECORATIVE_FLAG_COUNT }, (_, index) => index)

  return (
    <div className={`celebration-ribbon ${compact ? 'celebration-ribbon--compact' : ''}`}>
      <div className="celebration-ribbon__flags" aria-hidden="true">
        {flags.map((index) => (
          <NorwayFlag key={index} className="norway-flag" delayMs={index * 140} />
        ))}
      </div>
      <span className="celebration-ribbon__text">17. mai edition</span>
    </div>
  )
}

function App() {
  const [geoJson, setGeoJson] = useState<NorwayGeoJson | null>(null)
  const [bunads, setBunads] = useState<BunadEntry[]>([])
  const [deck, setDeck] = useState<BunadEntry[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [guess, setGuess] = useState<Coordinates | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let isActive = true

    async function loadGame() {
      setIsLoading(true)
      setError(null)

      try {
        const [mapData, rawEntries] = await Promise.all([
          loadJson<NorwayGeoJson>(MAP_DATA_URL),
          loadJson<unknown>(BUNAD_DATA_URL),
        ])

        if (!isActive) {
          return
        }

        const parsedEntries = parseBunadEntries(rawEntries)
        setGeoJson(mapData)
        setBunads(parsedEntries)
        setDeck(shuffleItems(parsedEntries))
        setRoundIndex(0)
        setGuess(null)
        setResults([])
        setIsRevealed(false)
      } catch (loadError) {
        if (!isActive) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Something went wrong while loading the map and bunad data.',
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadGame()

    return () => {
      isActive = false
    }
  }, [reloadToken])

  const totalScore = sumScores(results)
  const averageDistance = averageDistanceKm(results)
  const currentBunad = deck[roundIndex]
  const currentResult = isRevealed ? results.at(-1) ?? null : null
  const isFinished = !isLoading && !error && deck.length > 0 && roundIndex >= deck.length
  const bestResult =
    results.length > 0
      ? results.reduce((best, result) =>
          result.distanceKm < best.distanceKm ? result : best,
        )
      : null

  function restartGame(sourceEntries = bunads) {
    setDeck(shuffleItems(sourceEntries))
    setRoundIndex(0)
    setGuess(null)
    setResults([])
    setIsRevealed(false)
  }

  function handleConfirmGuess() {
    if (!currentBunad || !guess || isRevealed) {
      return
    }

    const distanceKm = haversineDistanceKm(guess, currentBunad.coordinates)
    const score = distanceToScore(distanceKm)

    setResults((currentResults) => [
      ...currentResults,
      {
        id: currentBunad.id,
        label: currentBunad.label,
        place: currentBunad.place,
        image: currentBunad.image,
        guess,
        answer: currentBunad.coordinates,
        distanceKm,
        score,
      },
    ])
    setIsRevealed(true)
  }

  function handleNextRound() {
    if (!isRevealed) {
      return
    }

    setRoundIndex((index) => index + 1)
    setGuess(null)
    setIsRevealed(false)
  }

  if (isLoading) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">Loading</span>
          <h1>Bunadkart</h1>
          <p>Preparing the Norway map and shuffling the first round.</p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">Load error</span>
          <h1>Could not start the game</h1>
          <p>{error}</p>
          <div className="action-row">
            <button type="button" className="button" onClick={() => setReloadToken((value) => value + 1)}>
              Try again
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!geoJson || deck.length === 0) {
    return (
      <main className="app-shell app-shell--state">
        <section className="state-card">
          <CelebrationRibbon compact />
          <span className="eyebrow">No data</span>
          <h1>No bunads found</h1>
          <p>Add entries to <code>public/bunader/bunads.json</code> and reload.</p>
        </section>
      </main>
    )
  }

  if (isFinished) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <div className="app-header__lead">
            <CelebrationRibbon />
            <span className="eyebrow">Finished</span>
            <h1>Bunadkart</h1>
            <p className="intro">
              The round deck is complete. Your average miss distance and per-bunad results are below.
            </p>
          </div>
          <div className="progress-strip">
            <div className="progress-pill">
              <span>Total score</span>
              <strong>{totalScore.toLocaleString()}</strong>
            </div>
            <div className="progress-pill">
              <span>Average miss</span>
              <strong>{formatDistanceKm(averageDistance)}</strong>
            </div>
            <div className="progress-pill">
              <span>Rounds</span>
              <strong>{results.length}</strong>
            </div>
          </div>
        </header>

        <section className="summary-card card">
          <div className="summary-hero">
            <div>
              <span className="eyebrow">Final result</span>
              <h2>{totalScore.toLocaleString()} points</h2>
              <p>
                Best accuracy:{' '}
                {bestResult
                  ? `${bestResult.label} at ${formatDistanceKm(bestResult.distanceKm)}`
                  : 'No rounds played'}
              </p>
            </div>
            <div className="action-row">
              <button type="button" className="button" onClick={() => restartGame()}>
                Play again
              </button>
            </div>
          </div>

          <div className="summary-list">
            {results.map((result) => (
              <article key={result.id} className="summary-row">
                <img
                  className="summary-row__image"
                  src={result.image}
                  alt={`${result.label} from ${result.place}`}
                />
                <div className="summary-row__copy">
                  <h3>{result.label}</h3>
                  <p>{result.place}</p>
                </div>
                <div className="summary-row__metric">
                  <span>Distance</span>
                  <strong>{formatDistanceKm(result.distanceKm)}</strong>
                </div>
                <div className="summary-row__metric">
                  <span>Score</span>
                  <strong>{result.score.toLocaleString()}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    )
  }

  const isLastRound = roundIndex === deck.length - 1
  const roundNumber = roundIndex + 1

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header__lead">
          <CelebrationRibbon />
          <span className="eyebrow">17. mai challenge</span>
          <h1>Bunadkart</h1>
          <p className="intro">
            Study the bunad, then place a single guess on Norway as close to the origin as possible.
          </p>
        </div>
        <div className="progress-strip">
          <div className="progress-pill">
            <span>Round</span>
            <strong>
              {roundNumber} / {deck.length}
            </strong>
          </div>
          <div className="progress-pill">
            <span>Total score</span>
            <strong>{totalScore.toLocaleString()}</strong>
          </div>
          <div className="progress-pill">
            <span>Status</span>
            <strong>{isRevealed ? 'Revealed' : guess ? 'Guess ready' : 'Waiting'}</strong>
          </div>
        </div>
      </header>

      <section className="game-layout">
        <article className="card image-panel">
          <div className="panel-heading">
            <span className="eyebrow">Current bunad</span>
            <p>{isRevealed ? 'Answer shown below' : 'The name stays hidden until you confirm your guess.'}</p>
          </div>

          <div className="image-frame">
            <img
              src={currentBunad.image}
              alt={isRevealed ? `${currentBunad.label} from ${currentBunad.place}` : 'Bunad for the current round'}
            />
          </div>

          <div className="prompt-card">
            <span className="prompt-card__label">Round goal</span>
            <p>{guess ? 'Guess placed. Click again to adjust before confirming.' : 'Click the map to place your guess.'}</p>
          </div>

          {currentResult ? (
            <div className="result-card">
              <div>
                <span className="eyebrow">Round result</span>
                <h2>{currentBunad.label}</h2>
                <p>{currentBunad.place}</p>
              </div>
              <div className="result-metrics">
                <div className="metric-box">
                  <span>Distance</span>
                  <strong>{formatDistanceKm(currentResult.distanceKm)}</strong>
                </div>
                <div className="metric-box">
                  <span>Round score</span>
                  <strong>{currentResult.score.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="hint-card">
              <span className="eyebrow">Scoring</span>
              <p>Points are calculated from distance in km. Closer guesses score higher.</p>
            </div>
          )}

          <div className="action-row">
            <button type="button" className="button" onClick={handleConfirmGuess} disabled={!guess || isRevealed}>
              Confirm guess
            </button>
            {isRevealed ? (
              <button type="button" className="button button--secondary" onClick={handleNextRound}>
                {isLastRound ? 'See final results' : 'Next bunad'}
              </button>
            ) : (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setGuess(null)}
                disabled={!guess}
              >
                Clear guess
              </button>
            )}
          </div>
        </article>

        <article className="card map-panel">
          <div className="panel-heading panel-heading--map">
            <div>
              <span className="eyebrow">Map</span>
              <h2>Norway</h2>
            </div>
            <p>Click once to place your guess.</p>
          </div>

          <NorwayMap
            key={roundIndex}
            geoJson={geoJson}
            guess={guess}
            answer={isRevealed ? currentBunad.coordinates : null}
            locked={isRevealed}
            onGuess={setGuess}
          />

          <div className="map-footer">
            <p>{isRevealed ? `Correct origin: ${currentBunad.place}` : 'Place one marker anywhere on the map.'}</p>
            <p>{guess ? 'Your marker is active.' : 'No marker placed yet.'}</p>
          </div>
        </article>
      </section>
    </main>
  )
}

export default App
