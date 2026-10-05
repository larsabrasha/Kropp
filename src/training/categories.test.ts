import { beforeEach, describe, expect, it } from 'vitest'
import { setLanguage } from '../i18n/i18n'
import { iconFor, workoutName } from './categories'
import type { BodyArea, Exercise, ExerciseKind, Workout } from './model'

describe('workoutName and iconFor', () => {
  let exercises: Map<string, Exercise>

  beforeEach(() => {
    setLanguage('sv')
    exercises = new Map()
  })

  const add = (name: string, kind: ExerciseKind = 'Strength', ...areas: BodyArea[]): string => {
    const e: Exercise = {
      id: crypto.randomUUID(),
      name,
      kind,
      isArchived: false,
      categories: [...areas],
      measuresTimeOnly: false,
    }
    exercises.set(e.id, e)
    return e.id
  }

  const workout = (...ids: string[]): Workout => ({
    id: crypto.randomUUID(),
    date: '2026-09-23',
    status: 'Planned',
    exercises: ids.map((exerciseId, order) => ({ exerciseId, order, sets: [], isSkipped: false })),
  })

  const name = (...ids: string[]) => workoutName(workout(...ids), exercises)
  const icon = (...ids: string[]) => iconFor(workout(...ids), exercises)

  it('names areas most exercises first', () => {
    const squat = add('Benböj lår framsida')
    const calf = add('Vader')
    const pull = add('Pull down maskin')
    const sit = add('Sit ups')

    expect(name(pull, squat, sit, calf)).toBe('Ben, rygg och mage')
  })

  it('names at most three areas, those with most exercises', () => {
    const squat = add('Benböj lår framsida')
    const calf = add('Vader')
    const pull = add('Pull down maskin')
    const pull2 = add('Pull down maskin 2')
    const sit = add('Sit ups')
    const curl = add('Biceps hantlar')
    const shrug = add('Dra upp nacke/axlar med hantlar')

    expect(name(squat, pull, sit, calf, pull2, curl, shrug)).toBe('Ben, rygg och mage')
  })

  it('gives a tie to the area the workout comes to first', () => {
    const walk = add('Gång i maskin', 'Cardio')
    const pull = add('Pull down maskin')
    const squat = add('Benböj lår framsida')
    const calf = add('Vader')
    const sit = add('Sit ups')
    const pull2 = add('Pull down maskin 2')

    // Two back and two leg exercises: the walk does not count, the pull down comes first.
    expect(name(walk, pull, squat, calf, sit, pull2)).toBe('Rygg, ben och mage')
    expect(icon(walk, pull, squat, calf, sit, pull2)).toBe('lat-pulldown')
    expect(icon(walk, squat, pull, calf, sit, pull2)).toBe('squat')
  })

  it('lets the most exercises win over coming first', () => {
    expect(
      icon(
        add('Bröst hantlar'),
        add('Benböj lår maskin'),
        add('Vader'),
        add('Bröstpress maskin'),
        add('Squats med kettlebell till huvud'),
      ),
    ).toBe('squat')
  })

  it('joins two areas with och', () => {
    expect(name(add('Benböj lår framsida'), add('Bröst maskin'))).toBe('Ben och bröst')
  })

  it('counts an exercise in two areas for both', () => {
    expect(name(add('Deadlift'))).toBe('Ben och rygg')
  })

  it('does not make the warm-up walk a leg day', () => {
    expect(
      name(add('Gång i maskin', 'Cardio'), add('Bröst maskin'), add('Biceps hantlar'), add('Triceps maskin')),
    ).toBe('Armar och bröst')
  })

  it('names only cardio cardio', () => {
    expect(name(add('Löpning på band', 'Cardio'))).toBe('Kondition')
  })

  it('lets chosen categories win over the default', () => {
    expect(name(add('Bröst maskin', 'Strength', 'Shoulders'))).toBe('Axlar')
  })

  it('gives no name to an exercise without known categories', () => {
    expect(name(add('Något nytt'))).toBeUndefined()
  })
})
