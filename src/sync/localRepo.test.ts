import { describe, expect, it, vi } from 'vitest'
import { followSync } from '../services'
import { FakeSyncApi } from '../test/fakeSyncApi'
import { toJson, type Workout } from '../training/model'
import { SyncEngine } from './engine'
import { LocalRepository } from './localRepo'
import { MemoryStore } from './memoryStore'

// The repository's memory, which the pages read synchronously so they never render without their
// data. It must always hold what the store holds.

const workout = (note: string): Workout => ({
  id: crypto.randomUUID(),
  date: '2026-09-21',
  note,
  status: 'Planned',
  exercises: [],
})

describe("the repository's memory", () => {
  it('holds what the store held when it loaded', async () => {
    const store = new MemoryStore()
    const w = workout('Ben')
    await new LocalRepository(store).save('workout', w.id, w)

    const repository = new LocalRepository(store)
    expect(repository.peekAll('workout')).toEqual([])
    await repository.load()

    expect(repository.peekAll('workout')).toEqual([w])
    expect(repository.peek('workout', w.id)).toEqual(w)
  })

  it('follows every save and delete before it tells the listeners', async () => {
    const repository = new LocalRepository(new MemoryStore())
    const w = workout('Ben')
    const seen: Workout[][] = []
    repository.onChange(() => seen.push(repository.peekAll('workout')))

    await repository.save('workout', w.id, w)
    await repository.save('workout', w.id, { ...w, note: 'Rygg' })
    await repository.delete('workout', w.id)

    expect(seen).toEqual([[w], [{ ...w, note: 'Rygg' }], []])
  })

  it('tells the listeners what type was saved, so a page can follow only what it shows', async () => {
    const repository = new LocalRepository(new MemoryStore())
    const types: string[] = []
    repository.onChange((type) => types.push(type))

    await repository.save('workout', workout('Ben').id, workout('Ben'))
    await repository.delete('exercise', '00000000-0000-0000-0000-000000000001')

    expect(types).toEqual(['workout', 'exercise'])
  })

  it('reads what a sync stored, and only then tells the views', async () => {
    const store = new MemoryStore()
    const repository = new LocalRepository(store)
    const api = new FakeSyncApi()
    const engine = new SyncEngine(store, api)
    followSync(repository, engine)
    const fromPhone = workout('Från telefonen')
    api.seedFromOtherDevice({
      type: 'workout',
      id: fromPhone.id,
      modifiedAt: '2026-09-23T08:00:00.000Z',
      isDeleted: false,
      data: toJson(fromPhone),
    })
    const shown = new Promise<Workout[]>((resolve) =>
      repository.onRemoteChange(() => resolve(repository.peekAll('workout'))),
    )

    await engine.sync()

    expect(await shown).toEqual([fromPhone])
  })

  it('reads again when a save lands while it loads, so the save is never lost from memory', async () => {
    const store = new MemoryStore()
    const repository = new LocalRepository(store)
    const saved = workout('Under laddningen')
    const getAll = store.getAll.bind(store)
    let first = true
    vi.spyOn(store, 'getAll').mockImplementation(async (type) => {
      // The first read sees the store before the save; the save lands before the load ends.
      const records = await getAll(type)
      if (first && type === 'workout') {
        first = false
        await repository.save('workout', saved.id, saved)
      }
      return records
    })

    await repository.load()

    expect(repository.peekAll('workout')).toEqual([saved])
  })

  it('throws from peek when the store could not be read, so the pages can say so', async () => {
    const store = new MemoryStore()
    vi.spyOn(store, 'getAll').mockRejectedValue(new Error('IndexedDB is blocked'))
    const repository = new LocalRepository(store)

    await expect(repository.load()).rejects.toThrow('IndexedDB is blocked')

    expect(() => repository.peekAll('workout')).toThrow('IndexedDB is blocked')
  })
})
