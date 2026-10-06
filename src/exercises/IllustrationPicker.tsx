import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { CATALOG } from '../illustrations/catalog'
import { EQUIPMENT, PICTURE_AREAS, SHOWS, type Equipment, type PictureArea } from '../illustrations/groups'
import { Limits } from '../training/limits'
import { NO_ILLUSTRATION, type BodyArea } from '../training/model'
import { chipStyle } from '../ui/chipStyle'
import { Picture } from '../ui/Picture'
import { SearchField } from '../ui/SearchField'

// Every illustration in one grid, "no picture" first, filtered by what it shows: an area and a
// kind of equipment, one of each from a menu, so a picture matches both (Bröst, Maskin); and searchable by
// its English name. It opens with the exercise's area chosen, its likely pictures first in view.
// It fills the sheet and scrolls with it, the search and filters kept at the top as iOS keeps a
// sheet's search in view. Thumbnails load lazily, so opening it fetches only what scrolls into
// view. The pictures' credit is shown here, where they are chosen, and not wherever one is shown.

// Ordinal and case-insensitive, as the names are English whatever the app's language.
const upper = (text: string) => text.toUpperCase()
const compareOrdinal = (a: string, b: string) => (upper(a) < upper(b) ? -1 : upper(a) > upper(b) ? 1 : 0)

function matching(query: string): [slug: string, name: string][] {
  const wanted = upper(query.trim())
  const asSlug = upper(query.trim().replaceAll(' ', '-'))
  return Object.entries(CATALOG)
    .filter(([slug, [name]]) => upper(name).includes(wanted) || upper(slug).includes(asSlug))
    .sort(([, [a]], [, [b]]) => compareOrdinal(a, b))
    .map(([slug, [name]]) => [slug, name])
}

const areaName = (area: PictureArea) =>
  area === 'Cardio' ? t('Workout.CardioOnly') : area === 'Other' ? t('Illustration.Other') : t(`BodyArea.${area}`)

/**
 * One filter, as iOS 26 offers one: a capsule naming what is chosen, with a chevron, that opens a
 * menu of the choices, the chosen one checked. Nothing chosen, it names what it filters ("Alla
 * områden"); something chosen, it is tinted and names that ("Rygg"), so the row says what is shown.
 */
function FilterMenu<T extends string>({
  label,
  all,
  choices,
  chosen,
  onChoose,
  name,
  testId,
}: {
  label: string
  all: string
  choices: readonly T[]
  chosen: T | undefined
  onChoose: (choice: T | undefined) => void
  name: (choice: T) => string
  testId: string
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const open = () => {
    const box = button.current?.getBoundingClientRect()
    if (box) setAnchor({ top: box.bottom + 8, left: Math.min(box.left, window.innerWidth - 256 - 12) })
  }
  const close = () => setAnchor(undefined)
  useEffect(() => {
    if (!anchor) return
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only the menu closes, not the sheet under it.
      e.stopImmediatePropagation()
      setAnchor(undefined)
    }
    document.addEventListener('keydown', escape, { capture: true })
    return () => document.removeEventListener('keydown', escape, { capture: true })
  }, [anchor])

  const text = chosen === undefined ? all : name(chosen)
  const item = (value: T | undefined, itemText: string) => (
    <button
      key={value ?? ''}
      type="button"
      role="menuitemradio"
      aria-checked={value === chosen}
      onClick={() => {
        close()
        onChoose(value)
      }}
      className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[1.0625rem] active:bg-black/5 dark:active:bg-white/10"
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        {value === chosen && (
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      {itemText}
    </button>
  )

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (anchor ? close() : open())}
        aria-haspopup="menu"
        aria-expanded={anchor !== undefined}
        aria-label={`${label}: ${text}`}
        data-testid={testId}
        className={`${chipStyle(chosen !== undefined)} min-w-0 gap-1.5`}
      >
        <span className="truncate">{text}</span>
        <svg
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-50" onClick={close} aria-hidden="true" />
            <div
              role="menu"
              aria-label={label}
              style={{ top: anchor.top, left: anchor.left }}
              className="menu fixed z-50 max-h-[60dvh] w-64 origin-top-left overflow-y-auto rounded-[1.625rem] py-1.5 motion-safe:animate-[menu-in_320ms_cubic-bezier(0.32,0.72,0,1)]"
              data-testid={`${testId}-menu`}
            >
              {item(undefined, all)}
              <div className="mt-1.5 border-t-[6px] border-black/5 pt-1.5 dark:border-white/5">
                {choices.map((choice) => item(choice, name(choice)))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

export function IllustrationPicker({
  selected,
  onPick,
  areas = [],
  cardio = false,
}: {
  selected: string | undefined
  onPick: (slug: string) => void
  /** What the exercise trains: the first is chosen at the start. */
  areas?: readonly BodyArea[]
  cardio?: boolean
}) {
  const [query, setQuery] = useState('')
  // What the exercise trains is chosen at the start: its likely pictures, a tap from all of them.
  const [area, setArea] = useState<PictureArea | undefined>(cardio ? 'Cardio' : areas[0])
  const [equipment, setEquipment] = useState<Equipment>()
  const shown = matching(query).filter(([slug]) => {
    const [a, e] = SHOWS[slug] ?? ['Other', 'Bodyweight']
    return (area === undefined || a === area) && (equipment === undefined || e === equipment)
  })

  return (
    <div data-testid="illustration-picker">
      <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-ground px-5 pt-2 pb-2">
        <SearchField
          value={query}
          maxLength={Limits.search}
          onValueChange={setQuery}
          placeholder={t('Illustration.Search')}
        />
        {/* What is shown, as a filter of iOS 26 says it: one capsule each for area and equipment. */}
        <div className="mt-2 flex gap-2">
          <FilterMenu
            label={t('Illustration.FilterArea')}
            all={t('Illustration.AllAreas')}
            choices={PICTURE_AREAS}
            chosen={area}
            onChoose={setArea}
            name={areaName}
            testId="area-filter"
          />
          <FilterMenu
            label={t('Illustration.FilterEquipment')}
            all={t('Illustration.AllEquipment')}
            choices={EQUIPMENT}
            chosen={equipment}
            onChoose={setEquipment}
            name={(e) => t(`Equipment.${e}`)}
            testId="equipment-filter"
          />
        </div>
        <p className="mt-1.5 px-4 text-[0.8125rem] text-label-2">{t('Illustration.Count', shown.length)}</p>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => onPick(NO_ILLUSTRATION)}
          className={`flex aspect-square items-center justify-center rounded-[0.875rem] border border-dashed border-label-3 p-1 text-center text-[0.8125rem] text-label-2 ${selected === undefined ? 'ring-2 ring-blue-500' : ''}`}
        >
          {t('Illustration.None')}
        </button>
        {shown.map(([slug, name]) => (
          <button
            type="button"
            key={slug}
            onClick={() => onPick(slug)}
            title={name}
            aria-label={name}
            data-slug={slug}
            className={`rounded-[0.875rem] ${selected === slug ? 'ring-2 ring-blue-500' : ''}`}
          >
            <Picture slug={slug} size="grid" lazy />
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="px-4 py-6 text-center text-[0.9375rem] text-label-2" data-testid="no-pictures">
          {t('Illustration.NoMatch')}
        </p>
      )}
      <p className="mt-4 px-4 text-[0.8125rem] leading-tight text-label-2" data-testid="illustration-credit">
        {t('Illustration.Credit')}{' '}
        <a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noopener" className="underline">
          Bryl Lim
        </a>
        ,{' '}
        <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener" className="underline">
          Everkinetic
        </a>
        ,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener" className="underline">
          CC BY-SA 4.0
        </a>
      </p>
    </div>
  )
}
