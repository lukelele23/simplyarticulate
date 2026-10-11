import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabase.js";

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RecordingsScreen({ user, onBack }) {
  const [recordings, setRecordings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadRecordings() {
      setIsLoading(true);
      setError("");

      try {
        const { data, error: queryError } = await supabase
          .from("speech_recordings")
          .select("id, audio_path, mime_type, duration_seconds, topic, difficulty, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;

        const recordingsWithUrls = await Promise.all(
          (data ?? []).map(async (recording) => {
            const { data: urlData, error: urlError } = await supabase.storage
              .from("speech-recordings")
              .createSignedUrl(recording.audio_path, 3600);

            return {
              ...recording,
              audioUrl: urlData?.signedUrl ?? null,
              audioError: urlError?.message ?? "",
            };
          })
        );

        if (isActive) setRecordings(recordingsWithUrls);
      } catch (cause) {
        if (isActive) {
          setError(`Could not load your saved recordings: ${cause.message || String(cause)}`);
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadRecordings();
    return () => {
      isActive = false;
    };
  }, [user.id]);

  return (
    <main className="screen min-h-screen">
      <section className="grid w-full max-w-3xl gap-6 rounded-[28px] border border-line bg-panel/95 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.4),inset_0_1px_rgba(255,255,255,0.04)] sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-2">
            <h1 className="m-0 text-3xl font-bold text-[#f3f5f7]">Saved recordings</h1>
            <p className="m-0 text-sm text-[#b9bbbd]">
              Listen to audio saved to your account.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#9da1a3]/70 bg-gradient-to-r from-[#3a3c3e] to-[#303234] px-4 py-2.5 text-sm font-bold text-[#e5f4ff] shadow-[0_5px_16px_rgba(45,111,163,0.2)] transition-[background,border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#d8d9db] hover:from-[#205781] hover:to-[#3a3c3e] hover:shadow-[0_8px_20px_rgba(45,111,163,0.34)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d0d2d4]"
          >
            Back to Practice
          </button>
        </header>

        {isLoading && <p role="status" className="m-0 text-[#aec2d8]">Loading your recordings…</p>}
        {error && (
          <p role="alert" className="m-0 rounded-lg border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {!isLoading && !error && recordings.length === 0 && (
          <p className="m-0 rounded-xl border border-[#494b4d] bg-[#0b2031] p-5 text-[#aec2d8]">
            No saved recordings yet. After you finish speaking, choose “Save to my account” on the practice screen.
          </p>
        )}

        <div className="grid gap-4">
          {recordings.map((recording) => (
            <article
              key={recording.id}
              className="grid gap-3 rounded-xl border border-[#494b4d] bg-[#0b2031] p-4"
            >
              <div className="grid gap-1">
                <h2 className="m-0 text-lg font-bold text-[#f3f5f7]">{recording.topic}</h2>
                <p className="m-0 text-sm text-[#aec2d8]">
                  {recording.difficulty} difficulty · {recording.duration_seconds}s · {formatDate(recording.created_at)}
                </p>
              </div>
              {recording.audioUrl ? (
                <>
                  <audio className="recording-player" controls controlsList="nodownload" preload="metadata" src={recording.audioUrl}>
                    Your browser does not support audio playback.
                  </audio>
                </>
              ) : (
                <p role="alert" className="m-0 text-sm text-red-200">
                  Could not access this audio file: {recording.audioError}
                </p>
              )}
            </article>
          ))}
        </div>
        {!isLoading && recordings.length > 0 && (
          <p className="m-0 text-xs text-[#b9bbbd]">
            Playback links are private and expire after one hour. Reopen this page to refresh them.
          </p>
        )}
      </section>
    </main>
  );
}

