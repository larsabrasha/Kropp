import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AggregateTypes } from '../sync/protocol'
import { NO_ILLUSTRATION, newId, toJson, type Exercise } from '../training/model'
import { validateChange } from '../training/validate'
import { CATALOG } from './catalog'
import { picture, slugFor } from './illustrations'

const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url))
const EXERCISES = join(PUBLIC, 'exercises')

const named = (name: string, illustration?: string): Exercise => ({
  id: newId(),
  name,
  kind: 'Strength',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
  illustration,
})

const svgFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? svgFiles(join(dir, entry.name)) : entry.name.endsWith('.svg') ? [join(dir, entry.name)] : [],
  )

it('gives an imported name its default picture', () => {
  expect(slugFor(named('bröst maskin '))).toBe('machine-chest-press')
})

it('lets a chosen picture win over the default', () => {
  expect(slugFor(named('Bröst maskin', 'pec-deck'))).toBe('pec-deck')
})

it('lets no picture be chosen', () => {
  expect(slugFor(named('Bröst maskin', NO_ILLUSTRATION))).toBeUndefined()
})

it('has no picture for an unknown name or picture', () => {
  expect(slugFor(named('Något nytt'))).toBeUndefined()
  expect(slugFor(named('Bröst maskin', 'not-a-picture'))).toBeUndefined()
})

it('has every picture in the catalog on disk', () => {
  const entries = Object.entries(CATALOG)
  expect(entries).toHaveLength(302)
  expect(entries.every(([, [, frame]]) => frame >= 1 && frame <= 3)).toBe(true)
  const missing = Object.keys(CATALOG)
    .map(picture)
    .filter((p) => !existsSync(join(PUBLIC, p)))
  expect(missing).toEqual([])
})

it('shows the most legible frame', () => {
  expect(picture('lat-pulldown')).toBe('/exercises/lat-pulldown/frame-2.svg')
})

it('has no picture that carries script or external references', () => {
  const offending = svgFiles(EXERCISES).filter((file) => {
    const svg = readFileSync(file, 'utf8')
    return /<script/i.test(svg) || /href=/i.test(svg) || /<foreignObject/i.test(svg) || /\son\w+=/i.test(svg)
  })
  expect(offending).toEqual([])
})

describe('the server accepts only picture names', () => {
  it.each([
    ['plank', true],
    ['none', true],
    ['../etc/passwd', false],
    ['Plank', false],
  ])('%s: %s', (illustration, valid) => {
    const exercise = named('Plankan', illustration)
    const error = validateChange({
      type: AggregateTypes.exercise,
      id: exercise.id,
      modifiedAt: new Date(0).toISOString(),
      isDeleted: false,
      data: toJson(exercise),
    })

    expect(error === null).toBe(valid)
  })
})
