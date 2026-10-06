import { ALL_AGGREGATE_TYPES, AggregateTypes, SyncLimits, stampTime, type SyncChange } from '../sync/protocol'
import { isDateOnly } from './dates'
import {
  BODY_AREAS,
  EMPTY_ID,
  EXERCISE_KINDS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  SETTINGS_ID,
  WORKOUT_STATUSES,
} from './model'

// Checks a change before it is stored. The server runs it on every push; the app never relies on
// it for anything the server does not check again. The checks are wider than the app's own limits
// (limits.ts), so data logged before those stays valid.

const MAX_TEXT = 2000
const MAX_NAME = 200
const MAX_EXERCISES_PER_WORKOUT = 100
const MAX_SETS_PER_EXERCISE = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ILLUSTRATION = /^[a-z0-9-]{1,80}$/

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Thrown for a document that is not even the right shape. */
class ShapeError extends Error {}

type Json = Record<string, unknown>

/** @returns an English description of the first problem, or null when the change is valid. */
export function validateChange(change: SyncChange): string | null {
  if (!ALL_AGGREGATE_TYPES.has(change.type)) return `Unknown aggregate type '${change.type}'.`
  if (!isUuid(change.id) || change.id === EMPTY_ID) return 'The id is empty.'
  if (change.isDeleted) return change.data === null ? null : 'A tombstone carries no data.'
  if (change.data === null) return 'A change that is not a tombstone must carry data.'
  if (change.data.length > SyncLimits.maxDocumentLength) return 'The document is too large.'

  try {
    const json = object(JSON.parse(change.data), 'The document is null.')
    const id = change.id.toLowerCase()
    switch (change.type) {
      case AggregateTypes.workout:
        return validateWorkout(id, json)
      case AggregateTypes.exercise:
        return validateExercise(id, json)
      case AggregateTypes.template:
        return validateTemplate(id, json)
      case AggregateTypes.settings:
        return validateSettings(id, json)
      case AggregateTypes.trashedWorkout:
        return validateTrashedWorkout(id, json)
      default:
        return null
    }
  } catch (error) {
    if (error instanceof ShapeError || error instanceof SyntaxError)
      return `The document is not a valid ${change.type}: ${error.message}`
    throw error
  }
}

/** Checks the fields a change itself must have, before validateChange looks at its document. */
export function isSyncChange(value: unknown): value is SyncChange {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Json
  return (
    typeof c.type === 'string' &&
    typeof c.id === 'string' &&
    typeof c.modifiedAt === 'string' &&
    !Number.isNaN(stampTime(c.modifiedAt)) &&
    typeof c.isDeleted === 'boolean' &&
    (c.data === null || c.data === undefined || typeof c.data === 'string')
  )
}

function validateWorkout(id: string, w: Json): string | null {
  const workoutId = uuid(w.id, 'id')
  const date = w.date
  if (!isDateOnly(date)) throw new ShapeError('The date is not a date.')
  optional(w.sessionNumber, integer, 'sessionNumber')
  optional(w.status, (v) => oneOf(v, WORKOUT_STATUSES, 'status'), 'status')
  const note = optional(w.note, text, 'note')
  optional(w.templateId, (v) => uuid(v, 'templateId'), 'templateId')
  const exercises = optional(w.exercises, array, 'exercises') ?? []

  if (workoutId !== id) return "The document's id does not match the change's id."
  const year = Number(date.slice(0, 4))
  if (year < 2000 || year > 2100) return 'The date is out of range.'
  if (note !== undefined && note.length > MAX_TEXT) return 'The note is too long.'
  return validateEntries(exercises)
}

function validateTrashedWorkout(id: string, t: Json): string | null {
  const trashedId = uuid(t.id, 'id')
  const deletedAt = text(t.deletedAt, 'deletedAt')
  const time = stampTime(deletedAt)
  if (Number.isNaN(time)) throw new ShapeError('deletedAt is not a timestamp.')
  const workout = object(t.workout, 'workout is missing.')

  if (trashedId !== id) return "The document's id does not match the change's id."
  const year = new Date(time).getUTCFullYear()
  if (year < 2000 || year > 2100) return 'The deletion time is out of range.'
  return validateWorkout(id, workout)
}

function validateTemplate(id: string, t: Json): string | null {
  const templateId = uuid(t.id, 'id')
  const name = text(t.name, 'name')
  const exercises = optional(t.exercises, array, 'exercises') ?? []

  if (templateId !== id) return "The document's id does not match the change's id."
  if (name.trim() === '' || name.length > MAX_NAME) return 'The template needs a name of at most 200 characters.'
  return validateEntries(exercises)
}

function validateSettings(id: string, s: Json): string | null {
  const settingsId = optional(s.id, (v) => uuid(v, 'id')) ?? SETTINGS_ID
  const sessions = optional(s.sessionsPerWeek, integer, 'sessionsPerWeek') ?? 3
  const resetAt = optional(s.resetAt, text, 'resetAt')
  if (resetAt !== undefined && Number.isNaN(stampTime(resetAt))) throw new ShapeError('resetAt is not a timestamp.')

  if (id !== SETTINGS_ID || settingsId !== id) return 'Settings are stored under their fixed id only.'
  if (sessions < MIN_SESSIONS_PER_WEEK || sessions > MAX_SESSIONS_PER_WEEK)
    return 'Sessions per week must be between 1 and 7.'
  if (resetAt !== undefined) {
    const year = new Date(stampTime(resetAt)).getUTCFullYear()
    if (year < 2000 || year > 2100) return 'The reset time is out of range.'
  }
  return null
}

function validateEntries(entries: unknown[]): string | null {
  if (entries.length > MAX_EXERCISES_PER_WORKOUT) return 'The workout has too many exercises.'

  for (const raw of entries) {
    const e = object(raw, 'An exercise entry is null.')
    const exerciseId = uuid(e.exerciseId, 'exerciseId')
    optional(e.order, integer, 'order')
    const comment = optional(e.comment, text, 'comment')
    const settings = optional(e.settings, text, 'settings')
    const ints = ['targetSets', 'targetReps', 'targetSeconds', 'avgHeartRate'].map((k) => optional(e[k], integer, k))
    const decimals = [
      'targetWeightKg',
      'durationMinutes',
      'distanceKm',
      'targetDurationMinutes',
      'targetDistanceKm',
    ].map((k) => optional(e[k], number, k))
    optional(e.isSkipped, boolean, 'isSkipped')
    const sets = (optional(e.sets, array, 'sets') ?? []).map((raw) => {
      const s = object(raw, 'A set is null.')
      return [
        optional(s.reps, integer, 'reps'),
        optional(s.seconds, integer, 'seconds'),
        optional(s.weightKg, number, 'weightKg'),
      ]
    })

    if (exerciseId === EMPTY_ID) return 'An exercise entry has no exercise.'
    if ((comment?.length ?? 0) > MAX_TEXT || (settings?.length ?? 0) > MAX_TEXT)
      return 'An exercise entry has too long a text.'
    if (sets.length > MAX_SETS_PER_EXERCISE) return 'An exercise entry has too many sets.'
    if ([...ints, ...decimals, ...sets.flat()].some((v) => v !== undefined && v < 0))
      return 'An exercise entry has a negative value.'
  }
  return null
}

function validateExercise(id: string, e: Json): string | null {
  const exerciseId = uuid(e.id, 'id')
  const name = text(e.name, 'name')
  const settingsNote = optional(e.settingsNote, text, 'settingsNote')
  optional(e.kind, (v) => oneOf(v, EXERCISE_KINDS, 'kind'), 'kind')
  optional(e.isArchived, boolean, 'isArchived')
  optional(e.measuresTimeOnly, boolean, 'measuresTimeOnly')
  const categories = (optional(e.categories, array, 'categories') ?? []).map((c) => oneOf(c, BODY_AREAS, 'categories'))
  const weightStep = optional(e.weightStepKg, number, 'weightStepKg')
  const illustration = optional(e.illustration, text, 'illustration')

  if (exerciseId !== id) return "The document's id does not match the change's id."
  if (name.trim() === '') return 'The exercise has no name.'
  if (name.length > MAX_NAME) return 'The exercise name is too long.'
  if (settingsNote !== undefined && settingsNote.length > MAX_TEXT) return 'The settings note is too long.'
  if (categories.length > BODY_AREAS.length) return 'The categories are not valid.'
  if (weightStep !== undefined && (weightStep <= 0 || weightStep > 50)) return 'The weight step is out of range.'
  if (illustration !== undefined && !ILLUSTRATION.test(illustration)) return 'The illustration is not a valid name.'
  return null
}

// Shape checks. Each throws ShapeError for a value of the wrong type and returns it typed.

function object(value: unknown, message: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ShapeError(message)
  return value as Json
}

function optional<T>(value: unknown, check: (v: unknown, name: string) => T, name = ''): T | undefined {
  return value === undefined || value === null ? undefined : check(value, name)
}

function uuid(value: unknown, name: string): string {
  if (!isUuid(value)) throw new ShapeError(`${name} is not an id.`)
  return value.toLowerCase()
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new ShapeError(`${name} is not a text.`)
  return value
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ShapeError(`${name} is not a number.`)
  return value
}

function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) throw new ShapeError(`${name} is not a whole number.`)
  return value as number
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new ShapeError(`${name} is not true or false.`)
  return value
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError(`${name} is not a list.`)
  return value
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new ShapeError(`${name} is not valid.`)
  return value as T
}
