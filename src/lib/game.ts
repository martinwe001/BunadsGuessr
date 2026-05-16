import type { Coordinates, RoundResult } from '../types'

const EARTH_RADIUS_KM = 6371

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function shuffleItems<T>(items: T[]) {
  const nextItems = [...items]

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]]
  }

  return nextItems
}

export function haversineDistanceKm([guessLon, guessLat]: Coordinates, [answerLon, answerLat]: Coordinates) {
  const latDistance = toRadians(answerLat - guessLat)
  const lonDistance = toRadians(answerLon - guessLon)
  const guessLatitude = toRadians(guessLat)
  const answerLatitude = toRadians(answerLat)

  const haversineValue =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(guessLatitude) * Math.cos(answerLatitude) * Math.sin(lonDistance / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversineValue))
}

export function distanceToScore(distanceKm: number) {
  return Math.max(0, Math.round(5000 * Math.exp(-distanceKm / 450)))
}

export function formatDistanceKm(distanceKm: number) {
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(0)} km`
}

export function sumScores(results: RoundResult[]) {
  return results.reduce((sum, result) => sum + result.score, 0)
}

export function averageDistanceKm(results: RoundResult[]) {
  if (results.length === 0) {
    return 0
  }

  const totalDistance = results.reduce((sum, result) => sum + result.distanceKm, 0)

  return totalDistance / results.length
}
