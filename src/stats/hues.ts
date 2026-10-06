// Each measure has a colour of its own, as Fitness gives Move, Exercise and Stand theirs, and keeps
// it wherever it shows: its tiles, its chart, its icon. Text in 700 on white and 400 on the dark
// cell holds at least 4.5:1; bars may be a step lighter, as they carry no text.

export interface Hue {
  /** The figure and the icon. */
  text: string
  /** Bars and other marks. */
  fill: string
  /** An outline of the measure, SF Symbols-like, 24 × 24. */
  icon: string
}

export const HUES = {
  workouts: {
    text: 'text-green-700 dark:text-green-400',
    fill: 'bg-green-600 dark:bg-green-500',
    icon: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  },
  perWeek: {
    text: 'text-sky-700 dark:text-sky-400',
    fill: 'bg-sky-600 dark:bg-sky-500',
    icon: 'M4 17l5-5 3.5 3.5L20 8M15 8h5v5',
  },
  records: {
    text: 'text-amber-700 dark:text-amber-400',
    fill: 'bg-amber-500 dark:bg-amber-400',
    icon: 'M12 3.5l2.5 5.2 5.6.8-4 4 1 5.6L12 16.4l-5.1 2.7 1-5.6-4-4 5.6-.8z',
  },
  exercises: {
    text: 'text-teal-700 dark:text-teal-400',
    fill: 'bg-teal-600 dark:bg-teal-500',
    icon: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  },
  sets: {
    text: 'text-violet-700 dark:text-violet-400',
    fill: 'bg-violet-600 dark:bg-violet-500',
    icon: 'M5 12.5l4.5 4.5L19 7.5',
  },
  lifted: {
    text: 'text-orange-700 dark:text-orange-400',
    fill: 'bg-orange-600 dark:bg-orange-500',
    icon: 'M7 9h10l2.5 11h-15zM9.5 9a2.5 2.5 0 0 1 5 0',
  },
  cardio: {
    text: 'text-pink-700 dark:text-pink-400',
    fill: 'bg-pink-600 dark:bg-pink-500',
    icon: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z',
  },
} as const satisfies Record<string, Hue>
