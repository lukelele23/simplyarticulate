export default function DailyChallengeActions({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex w-fit self-start items-center gap-2 rounded-xl border border-line bg-panel/90 px-3 py-2 text-left text-xs font-bold text-copy shadow-[0_6px_18px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-panel-raised hover:shadow-[0_9px_22px_rgba(0,0,0,0.25)] active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-4"
        >
          <path
            d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="leading-tight">Daily Challenge</span>
    </button>
  );
}

