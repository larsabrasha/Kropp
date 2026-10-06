import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from './sync/backup'
import { IndexedDbStore } from './sync/indexedDbStore'
import { LocalRepository } from './sync/localRepo'
import type { LocalRecord } from './sync/localStore'
import { MemoryStore } from './sync/memoryStore'
import { ALL_AGGREGATE_TYPES, AggregateTypes, type SyncChange } from './sync/protocol'
import {
  BODY_AREAS,
  EMPTY_ID,
  EXERCISE_KINDS,
  readExercise,
  readSettings,
  readTemplate,
  readTrashedWorkout,
  readWorkout,
  SETTINGS_ID,
  toJson,
  WORKOUT_STATUSES,
  type Exercise,
  type SetResult,
  type TrashedWorkout,
  type UserSettings,
  type Workout,
  type WorkoutExercise,
  type WorkoutTemplate,
} from './training/model'
import { validateChange } from './training/validate'

// What installed phones and the database already hold. Every test here guards something stored
// outside this repository, written by this version or the .NET one before it. When one fails, the
// change would strand existing data: change the code back, not the test. Adding is fine (a new
// optional field, a new aggregate type, a new enum value); renaming or removing is not. A new field
// goes into the documents below as well, and into the server's checks in validate.ts.

describe('the stored names', () => {
  it('keeps the aggregate types', () => {
    expect(AggregateTypes).toEqual({
      workout: 'workout',
      exercise: 'exercise',
      template: 'template',
      settings: 'settings',
      trashedWorkout: 'trashedWorkout',
    })
  })

  it('keeps the enum values', () => {
    expect(BODY_AREAS).toEqual(['Legs', 'Chest', 'Back', 'Core', 'Arms', 'Shoulders'])
    expect(EXERCISE_KINDS).toEqual(['Strength', 'Bodyweight', 'Timed', 'Cardio'])
    expect(WORKOUT_STATUSES).toEqual(['Planned', 'Done', 'Skipped', 'InProgress'])
  })

  it('keeps the fixed ids', () => {
    expect(SETTINGS_ID).toBe('00000000-0000-0000-0000-00000000c0de')
    expect(EMPTY_ID).toBe('00000000-0000-0000-0000-000000000000')
  })
})

// Each aggregate with every field set, and the JSON it is stored as. Required<>, so a field added to
// or renamed in model.ts fails the type check here until it is added below too.
const WORKOUT_ID = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
const EXERCISE_ID = '11111111-1111-1111-1111-111111111111'
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222'

const set: Required<SetResult> = { reps: 8, weightKg: 22.5, seconds: 30 }

const workoutEntry: Required<WorkoutExercise> = {
  exerciseId: EXERCISE_ID,
  order: 0,
  comment: 'Tungt',
  settings: '45 grader',
  targetSets: 3,
  targetReps: 8,
  targetWeightKg: 22.5,
  targetSeconds: 30,
  targetDurationMinutes: 20,
  targetDistanceKm: 3.5,
  sets: [set],
  isSkipped: false,
  durationMinutes: 21.5,
  distanceKm: 3.6,
  avgHeartRate: 130,
}

const workout: Required<Workout> = {
  id: WORKOUT_ID,
  date: '2026-09-22',
  sessionNumber: 7,
  status: 'Done',
  note: 'Pigg',
  templateId: TEMPLATE_ID,
  exercises: [workoutEntry],
}
const WORKOUT_JSON =
  `{"id":"${WORKOUT_ID}","date":"2026-09-22","sessionNumber":7,"status":"Done","note":"Pigg",` +
  `"templateId":"${TEMPLATE_ID}","exercises":[{"exerciseId":"${EXERCISE_ID}","order":0,"comment":"Tungt",` +
  `"settings":"45 grader","targetSets":3,"targetReps":8,"targetWeightKg":22.5,"targetSeconds":30,` +
  `"targetDurationMinutes":20,"targetDistanceKm":3.5,"sets":[{"reps":8,"weightKg":22.5,"seconds":30}],` +
  `"isSkipped":false,"durationMinutes":21.5,"distanceKm":3.6,"avgHeartRate":130}]}`

const exercise: Required<Exercise> = {
  id: EXERCISE_ID,
  name: 'Benpress',
  kind: 'Strength',
  settingsNote: 'Sitthöjd 11',
  isArchived: false,
  categories: ['Legs'],
  illustration: 'leg-press',
  measuresTimeOnly: false,
  weightStepKg: 2.5,
}
const EXERCISE_JSON =
  `{"id":"${EXERCISE_ID}","name":"Benpress","kind":"Strength","settingsNote":"Sitthöjd 11",` +
  `"isArchived":false,"categories":["Legs"],"illustration":"leg-press","measuresTimeOnly":false,"weightStepKg":2.5}`

const template: Required<WorkoutTemplate> = {
  id: TEMPLATE_ID,
  name: 'Ben',
  exercises: [{ exerciseId: EXERCISE_ID, order: 0, targetSets: 3, sets: [], isSkipped: false }],
}
const TEMPLATE_JSON =
  `{"id":"${TEMPLATE_ID}","name":"Ben","exercises":` +
  `[{"exerciseId":"${EXERCISE_ID}","order":0,"targetSets":3,"sets":[],"isSkipped":false}]}`

const settings: Required<UserSettings> = {
  id: SETTINGS_ID,
  sessionsPerWeek: 4,
  resetAt: '2026-10-06T12:00:00.000Z',
}
const SETTINGS_JSON = `{"id":"${SETTINGS_ID}","sessionsPerWeek":4,"resetAt":"2026-10-06T12:00:00.000Z"}`

const trashed: Required<TrashedWorkout> = { id: WORKOUT_ID, deletedAt: '2026-09-23T08:00:00.000Z', workout }
const TRASHED_JSON = `{"id":"${WORKOUT_ID}","deletedAt":"2026-09-23T08:00:00.000Z","workout":${WORKOUT_JSON}}`

const validate = (type: string, id: string, data: string) =>
  validateChange({ type, id, modifiedAt: '2026-09-23T08:00:00.000Z', isDeleted: false, data } satisfies SyncChange)

const documents: [string, unknown, string, (json: Record<string, unknown>) => unknown][] = [
  [AggregateTypes.workout, workout, WORKOUT_JSON, readWorkout],
  [AggregateTypes.exercise, exercise, EXERCISE_JSON, readExercise],
  [AggregateTypes.template, template, TEMPLATE_JSON, readTemplate],
  [AggregateTypes.settings, settings, SETTINGS_JSON, readSettings],
  [AggregateTypes.trashedWorkout, trashed, TRASHED_JSON, readTrashedWorkout],
]

describe.each(documents)('the %s document', (type, value, json, read) => {
  const id = (value as { id: string }).id

  it('is written as before', () => {
    expect(toJson(value)).toBe(json)
  })

  it('reads as before', () => {
    expect(read(JSON.parse(json))).toEqual(value)
  })

  it('passes the server', () => {
    expect(validate(type, id, json)).toBeNull()
  })

  it('has every field checked by the server', () => {
    const fields = Object.keys(value as object)
    const wrong = fields.filter((field) => validate(type, id, toJson({ ...(value as object), [field]: {} })) === null)
    expect(wrong, 'fields the server lets through with any value').toEqual([])
  })
})

it("has every field of a workout's exercises and sets checked by the server", () => {
  const withEntry = (e: object) => toJson({ ...workout, exercises: [e] })
  const wrong = [
    ...Object.keys(workoutEntry).filter(
      (f) => validate('workout', WORKOUT_ID, withEntry({ ...workoutEntry, [f]: {} })) === null,
    ),
    ...Object.keys(set).filter(
      (f) => validate('workout', WORKOUT_ID, withEntry({ ...workoutEntry, sets: [{ ...set, [f]: {} }] })) === null,
    ),
  ]
  expect(wrong, 'fields the server lets through with any value').toEqual([])
})

it('leaves empty fields out of a document', () => {
  expect(toJson({ ...settings, note: null, extra: undefined })).toBe(SETTINGS_JSON)
})

describe('an older document', () => {
  it('reads with defaults for the fields it lacks, and its id in lower case', () => {
    const upper = WORKOUT_ID.toUpperCase()
    expect(readWorkout({ id: upper, date: '2026-09-22', note: null })).toEqual({
      id: WORKOUT_ID,
      date: '2026-09-22',
      status: 'Planned',
      exercises: [],
    })
    expect(readExercise({ id: EXERCISE_ID, name: 'Benpress' })).toEqual({
      id: EXERCISE_ID,
      name: 'Benpress',
      kind: 'Strength',
      isArchived: false,
      categories: [],
      measuresTimeOnly: false,
    })
    expect(readSettings({})).toEqual({ id: SETTINGS_ID, sessionsPerWeek: 3 })
  })
})

// Exported files that users keep. Every version ever written is here, as it was written, and must
// import for as long as the app lives: a new version adds its file and the step from the one before
// (MIGRATIONS in src/sync/backup.ts); it never changes one that is here.
// Literal text, never built from the documents above: those grow with the model, a file does not.
const BACKUP_FILES: Record<number, string> = {
  1:
    '{"format":"kropp","version":1,"exportedAt":"2026-10-06T12:00:00.000Z","records":[' +
    '{"type":"workout","id":"6f9619ff-8b86-d011-b42d-00c04fc964ff","modifiedAt":"2026-09-22T18:30:00' +
    '.123Z","data":{"id":"6f9619ff-8b86-d011-b42d-00c04fc964ff","date":"2026-09-22","sessionNumber":' +
    '7,"status":"Done","note":"Pigg","templateId":"22222222-2222-2222-2222-222222222222","exercises"' +
    ':[{"exerciseId":"11111111-1111-1111-1111-111111111111","order":0,"comment":"Tungt","settings":"' +
    '45 grader","targetSets":3,"targetReps":8,"targetWeightKg":22.5,"targetSeconds":30,"targetDurati' +
    'onMinutes":20,"targetDistanceKm":3.5,"sets":[{"reps":8,"weightKg":22.5,"seconds":30}],"isSkippe' +
    'd":false,"durationMinutes":21.5,"distanceKm":3.6,"avgHeartRate":130}]}},' +
    '{"type":"exercise","id":"11111111-1111-1111-1111-111111111111","modifiedAt":"2026-09-20T08:00:0' +
    '0.000Z","data":{"id":"11111111-1111-1111-1111-111111111111","name":"Benpress","kind":"Strength"' +
    ',"settingsNote":"Sitthöjd 11","isArchived":false,"categories":["Legs"],"illustration":"leg-pres' +
    's","measuresTimeOnly":false,"weightStepKg":2.5}},' +
    '{"type":"template","id":"22222222-2222-2222-2222-222222222222","modifiedAt":"2026-09-20T08:00:0' +
    '0.000Z","data":{"id":"22222222-2222-2222-2222-222222222222","name":"Ben","exercises":[{"exercis' +
    'eId":"11111111-1111-1111-1111-111111111111","order":0,"targetSets":3,"sets":[],"isSkipped":fals' +
    'e}]}},' +
    '{"type":"settings","id":"00000000-0000-0000-0000-00000000c0de","modifiedAt":"2026-09-20T08:00:0' +
    '0.000Z","data":{"id":"00000000-0000-0000-0000-00000000c0de","sessionsPerWeek":4}}]}',
}

// The aggregate types each version can hold. An app refuses a file of a later version rather than
// part of it, so a new aggregate type is a new version: an older app then asks to be updated
// instead of refusing the file's records as unknown.
const BACKUP_TYPES: Record<number, string[]> = {
  1: ['workout', 'exercise', 'template', 'settings', 'trashedWorkout'],
}

describe('the backup file', () => {
  it('has a file and the types for every version', () => {
    const versions = Array.from({ length: BACKUP_VERSION }, (_, i) => String(i + 1))
    expect(Object.keys(BACKUP_FILES)).toEqual(versions)
    expect(Object.keys(BACKUP_TYPES)).toEqual(versions)
    expect(BACKUP_FORMAT).toBe('kropp')
  })

  it('holds the aggregate types of its version', () => {
    expect([...ALL_AGGREGATE_TYPES]).toEqual(BACKUP_TYPES[BACKUP_VERSION])
  })

  it.each(Object.entries(BACKUP_FILES))('of version %s imports as it did', async (version, text) => {
    const parsed = parseBackup(text)
    expect(parsed.version).toBe(Number(version))

    const repository = new LocalRepository(new MemoryStore())
    await repository.restore(parsed.changes)
    // Each aggregate lands as reading its document does, with defaults for what came later.
    const readers = { workout: readWorkout, exercise: readExercise, template: readTemplate, settings: readSettings }
    const records = (JSON.parse(text) as { records: { type: keyof typeof readers; id: string; data: object }[] })
      .records
    expect(records.map((r) => r.type)).toEqual(['workout', 'exercise', 'template', 'settings'])
    for (const r of records)
      expect(repository.peek(r.type, r.id)).toEqual(readers[r.type](r.data as Record<string, unknown>))
    expect(repository.peek('workout', WORKOUT_ID)?.note).toBe('Pigg')
    expect((await repository.store.get(`workout:${WORKOUT_ID}`))?.modifiedAt).toBe('2026-09-22T18:30:00.123Z')
  })
})

describe('the IndexedDB database', () => {
  const record: LocalRecord = {
    key: `workout:${WORKOUT_ID}`,
    type: 'workout',
    id: WORKOUT_ID,
    modifiedAt: '2026-09-22T18:30:00.123+00:00',
    isDeleted: false,
    data: WORKOUT_JSON,
    pending: true,
  }

  const request = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

  /** The database as an installed phone has it: created by the .NET version's kropp-db.js. */
  function createInstalled(name: string) {
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () => {
      const db = open.result
      db.createObjectStore('records', { keyPath: 'key' }).createIndex('type', 'type')
      db.createObjectStore('meta', { keyPath: 'name' })
    }
    return request(open)
  }

  it('reads what an installed phone holds', async () => {
    const db = await createInstalled('kropp-installed')
    const tx = db.transaction(['records', 'meta'], 'readwrite')
    await request(tx.objectStore('records').put(record))
    await request(tx.objectStore('meta').put({ name: 'watermark', value: 42 }))
    db.close()

    const store = new IndexedDbStore('kropp-installed')
    expect(await store.getAll('workout')).toEqual([record])
    expect(await store.getPending()).toEqual([record])
    expect(await store.getWatermark()).toBe(42)
  })

  it('creates the same database a phone already has', async () => {
    const store = new IndexedDbStore()
    await store.put(record)
    await store.setWatermark(7)

    const db = await request(indexedDB.open('kropp'))
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames]).toEqual(['meta', 'records'])
    const tx = db.transaction(['records', 'meta'])
    const records = tx.objectStore('records')
    expect(records.keyPath).toBe('key')
    expect([...records.indexNames]).toEqual(['type'])
    expect(records.index('type').keyPath).toBe('type')
    expect(tx.objectStore('meta').keyPath).toBe('name')
    expect(await request(records.get(record.key))).toEqual(record)
    expect(await request(tx.objectStore('meta').get('watermark'))).toEqual({ name: 'watermark', value: 7 })
    db.close()
  })
})

describe('the service worker', () => {
  // Installed phones check these addresses and caches for updates; vite-plugin-pwa takes them
  // from vite.config.ts, so the check reads the config.
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

  it('keeps its file name', () => {
    expect(config).toContain(`filename: 'service-worker.js'`)
  })

  it("keeps the illustrations' cache", () => {
    expect(config).toContain(`cacheName: 'exercise-illustrations'`)
  })
})
