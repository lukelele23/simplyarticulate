export default function TopicActions({
  onContinue,
  onGenerate,
  hasTopic = true,
  canGenerate = true,
  onReroll,
  isShuffling,
  canContinue = true,
  showFavorite,
  isFavorite,
  onToggleFavorite,
}) {
  return (
    <div className={`mt-3 grid gap-2.5 max-[480px]:grid-cols-1 ${
      showFavorite
        ? "grid-cols-[1fr_auto_auto]"
        : "grid-cols-[1fr_auto]"
    }`}>
      <button
        className="w-full rounded-xl border border-[#c2c5c7] bg-gradient-to-br from-[#d8dadd] to-[#bfc2c4] px-4 py-3 font-bold text-[#202224] shadow-[0_8px_20px_rgba(164,168,171,0.16)] transition duration-200 hover:-translate-y-px hover:brightness-105 hover:shadow-[0_10px_24px_rgba(164,168,171,0.24)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7c9cb] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        onClick={hasTopic ? onContinue : onGenerate}
        disabled={isShuffling || (hasTopic ? !canContinue : !canGenerate)}
      >
        {isShuffling ? "Choosing…" : hasTopic ? "Continue with topic" : "Find my prompt"}
      </button>
      <button
        className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 font-bold text-copy shadow-[inset_0_1px_rgba(255,255,255,0.04)] transition duration-200 hover:-translate-y-px hover:border-accent/60 hover:bg-panel-raised hover:text-white hover:shadow-[0_8px_22px_rgba(0,0,0,0.2)] active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 max-[480px]:w-full"
        onClick={onReroll}
        disabled={isShuffling || !hasTopic}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="size-4 text-[#d0d2d4]"
        >
          <path
            d="M15.5 6.5h2v-2m0 2-3-3a6 6 0 0 0-9.8 2M4.5 13.5h-2v2m0-2 3 3a6 6 0 0 0 9.8-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{isShuffling ? "Rerolling..." : "or reroll"}</span>
      </button>
      {showFavorite && (
        <button
          type="button"
          aria-pressed={isFavorite}
          onClick={onToggleFavorite}
          disabled={isShuffling || !hasTopic}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#c7c9cb]/35 bg-[#292b2d] px-3 py-3 font-semibold text-[#dbdddf] transition duration-200 hover:border-[#d7d9db] hover:bg-[#3a3c3e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7c9cb] max-[480px]:w-full"
        >
          <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
          {isFavorite ? "Saved" : "Favorite"}
        </button>
      )}
    </div>
  );
}

