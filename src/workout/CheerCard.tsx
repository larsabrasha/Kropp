import type { CSSProperties } from 'react'
import { formatDate, formatOrdinal, t, type MessageKey } from '../i18n/i18n'
import type { Cheer } from '../stats/journey'
import type { DateOnly } from '../training/model'
import { CARD } from '../ui/styles'

// A word of praise under a finished workout. Every workout earns one, and it only ever tells what
// was done: which workout of all it was, and of its month.

const MORE: MessageKey[] = [
  'Cheer.Title.more0',
  'Cheer.Title.more1',
  'Cheer.Title.more2',
  'Cheer.Title.more3',
  'Cheer.Title.more4',
]

function cheerTitle(cheer: Cheer): string {
  switch (cheer.kind) {
    case 'first':
      return t('Cheer.Title.first')
    case 'milestone':
      return t('Cheer.Title.milestone', cheer.number)
    case 'back':
      return t('Cheer.Title.back')
    case 'goal':
      return t('Cheer.Title.goal')
    case 'more':
      // By the workout's number, so one workout keeps its words and the next has others.
      return t(MORE[cheer.number % MORE.length]!)
  }
}

function cheerDetail(cheer: Cheer, date: DateOnly): string {
  if (cheer.kind === 'first') return t('Cheer.First')
  const parts = [cheer.kind === 'milestone' ? t('Cheer.Milestone') : t('Cheer.Number', formatOrdinal(cheer.number))]
  if (cheer.inMonth > 1) parts.push(t('Cheer.InMonth', formatOrdinal(cheer.inMonth), formatDate(date, 'MMMM')))
  return parts.join(' · ')
}

// The confetti's colours, bright in light and dark alike. Its pieces burst from the card's middle
// and stay about within its width, so none of them widens the page.
const COLOURS = ['#34c759', '#ffcc00', '#5ac8fa', '#ff2d55', '#af52de', '#ff9500']
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * 2 * Math.PI + (i % 3) * 0.35
  const reach = 70 + (i % 4) * 22
  return {
    colour: COLOURS[i % COLOURS.length]!,
    x: Math.round(Math.cos(angle) * reach * 1.3),
    // Up and out first, settling lower: confetti falls.
    y: Math.round(Math.sin(angle) * reach + 30),
    r: (i % 2 === 0 ? 1 : -1) * (180 + (i % 5) * 70),
    delay: (i % 4) * 30,
  }
})

function Confetti() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-x-clip" aria-hidden="true" data-testid="confetti">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              background: p.colour,
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.r}deg`,
              '--delay': `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

/** The card; it rises into place, its star pops and confetti bursts when the workout has just been finished. */
export function CheerCard({ cheer, date, fresh }: { cheer: Cheer; date: DateOnly; fresh: boolean }) {
  return (
    <section
      className={`${CARD} relative flex items-center gap-3 p-4 ${fresh ? 'motion-safe:animate-[menu-in_420ms_cubic-bezier(0.32,0.72,0,1)]' : ''}`}
      data-testid="cheer"
      data-kind={cheer.kind}
      aria-live="polite"
    >
      {fresh && <Confetti />}
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-green-700 text-white ${fresh ? 'cheer-star-fresh' : ''}`}
      >
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3.5l2.5 5.2 5.6.8-4 4 1 5.6L12 16.4l-5.1 2.7 1-5.6-4-4 5.6-.8z" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[1.0625rem] font-semibold text-gray-900 dark:text-white" data-testid="cheer-title">
          {cheerTitle(cheer)}
        </p>
        <p className="mt-0.5 text-[0.9375rem] text-label-2" data-testid="cheer-detail">
          {cheerDetail(cheer, date)}
        </p>
      </div>
    </section>
  )
}
