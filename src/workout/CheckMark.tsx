/** The tick on a done set and on finished cardio. */
export function CheckMark() {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-green-700 dark:bg-white/85"
      aria-hidden="true"
      data-testid="check"
    >
      <svg
        className="size-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  )
}
