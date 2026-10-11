import { useEffect, useRef, useState } from "react";
import { supabase } from "../../utils/supabase.js";
import { PROMPTS, pickFresh } from "../lib/practice.js";
import TopicActions from "./TopicActions.jsx";

export default function WheelSelector({
  skill = "Clarity",
  difficulty = "easy",
  topicType = "speech",
  previousTopic,
  onSelectTopic,
  onContinueToResearch,
  showFavorite,
  isFavorite,
  onToggleFavorite,
}) {
  const [databaseTopics, setDatabaseTopics] = useState([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [topicsError, setTopicsError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffleSequence, setShuffleSequence] = useState([]);
  const [shuffleDuration, setShuffleDuration] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [debateSide, setDebateSide] = useState(null);
  const recentRef = useRef([]);
  const shuffleRef = useRef(null);
  const frameRef = useRef(null);
  const cancelShuffle = () => { clearTimeout(shuffleRef.current); cancelAnimationFrame(frameRef.current); };
  useEffect(() => () => cancelShuffle(), []);
  const selectedTopicRef = useRef(null);

  useEffect(() => {
    if (!selectedTopic || !selectedTopicRef.current) return;

    selectedTopicRef.current.focus({ preventScroll: true });

  }, [selectedTopic]);

  useEffect(() => {
    let isActive = true;

    cancelShuffle();
    setShuffleDuration(0);
    setCurrentIndex(0);
    setShuffleSequence([]);
    setSelectedTopic(null);
    setDebateSide(null);
    setIsShuffling(false);
    setDatabaseTopics([]);

    if (onSelectTopic) onSelectTopic(null);

    async function loadTopics() {
      setIsLoadingTopics(true);
      setTopicsError("");

      try {
        const query = topicType === "debate"
          ? supabase.from("debate_topics").select("id, topic").order("id", { ascending: true })
          : supabase
              .from("speech_topics")
              .select("event_type, topic, difficulty")
              .eq("event_type", topicType)
              .eq("difficulty", difficulty);
        const { data, error } = await query.abortSignal(AbortSignal.timeout(5000));

        if (!isActive) return;

        if (error) throw error;

        setDatabaseTopics(
          (data ?? [])
            .map((row) => ({
              eventType: topicType === "debate" ? "debate" : row.event_type,
              difficulty: topicType === "debate" ? difficulty : row.difficulty,
              prompt: row.topic,
            }))
            .filter(
              (topic) =>
                typeof topic.prompt === "string" &&
                topic.prompt.length > 0
            )
        );
      } catch (error) {
        if (!isActive) return;

        console.error("Failed to load speech topics:", error);

        setDatabaseTopics([]);
        setTopicsError(
          topicType === "debate"
            ? `Could not load debate topics from Supabase: ${error.message || String(error)}`
            : `The topic library is unavailable: ${error.message || String(error)}`
        );
      } finally {
        if (isActive) {
          setIsLoadingTopics(false);
        }
      }
    }

    loadTopics();

    return () => {
      isActive = false;
    };
  }, [difficulty, topicType, skill]);

  const fallback = topicType === "research"
    ? ["Research how your community could reduce food waste. Compare two approaches.", "Explore the benefits and drawbacks of a four-day school week.", "Investigate one local environmental issue and propose a practical response."]
    : [];
  // Curated prompts keep practice available when the topic service is unavailable.
  const curatedTopics = topicType === "speech"
    ? PROMPTS[skill].map(prompt => ({prompt,eventType:topicType,difficulty}))
    : fallback.map(prompt => ({prompt,eventType:topicType,difficulty}));
  const topics = [...curatedTopics, ...databaseTopics].filter(
    (topic) =>
      topic.eventType === topicType &&
      topic.difficulty === difficulty
  );

  function startShuffle() {
    if (isShuffling || !topics.length) return;
    cancelShuffle();
    setDebateSide(null);
    onSelectTopic?.(null);
    const prompts = [...new Set(topics.map(t => t.prompt))];
    const chosen = pickFresh(prompts, [...recentRef.current, selectedTopic ?? previousTopic].filter(Boolean));
    recentRef.current = [...recentRef.current, chosen].slice(-8);
    const settle = () => { setSelectedTopic(chosen); onSelectTopic?.(chosen); setIsShuffling(false); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') {
      settle(); return;
    }
    const steps = [selectedTopic ?? prompts[0]];
    for (let i = 0; i < 8; i++) steps.push(pickFresh(prompts, [steps.at(-1)]));
    steps.push(chosen);
    setShuffleDuration(0); setCurrentIndex(0); setShuffleSequence(steps); setIsShuffling(true);
    // Paint the starting row before one uninterrupted decelerating transition.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setShuffleDuration(1200); setCurrentIndex(steps.length - 1);
        shuffleRef.current = setTimeout(settle, 1220);
      });
    });
  }
  return (
    <section className="topic-generator" aria-busy={isShuffling || (isLoadingTopics && !topics.length)}>
      <div className={`topic-display-viewport${isShuffling ? ' is-shuffling' : ''}`}>
        {isShuffling ? <div className="topic-reel-track" aria-hidden="true" style={{transform:`translateY(calc(-${currentIndex} * var(--topic-height)))`,transitionDuration:`${shuffleDuration}ms`}}>
          {shuffleSequence.map((prompt,index)=><div className="topic-reel-item" key={index}><span className="topic-result-label">Your topic</span><span>{prompt}</span></div>)}
        </div> : <div className={selectedTopic ? 'topic-result-card' : 'topic-empty-state'} ref={selectedTopicRef} tabIndex={selectedTopic ? -1 : undefined} aria-label={selectedTopic ? `Selected topic: ${selectedTopic}` : undefined}>
          <span className="topic-result-label">{selectedTopic ? 'Your topic' : 'Your next prompt'}</span>
          <span>{selectedTopic || (isLoadingTopics && !topics.length ? 'Loading topics…' : topics.length ? 'A new thought is one click away.' : topicsError ? 'This topic library is unavailable. Try a different mode.' : 'No topics are available for this selection.')}</span>
        </div>}
      </div>
      <p className="topic-selection-status" role="status" aria-live="polite">{isShuffling ? 'Finding your next topic…' : selectedTopic ? 'Ready when you are.' : 'Choose a prompt to begin.'}</p>
      {topicType === 'debate' && <fieldset className="topic-side-control"><legend>Choose your side</legend><div className="skill-options">{['affirmative','negative'].map(side=><button key={side} aria-pressed={debateSide===side} disabled={!selectedTopic || isShuffling} onClick={()=>setDebateSide(side)}>{side[0].toUpperCase()+side.slice(1)}</button>)}</div></fieldset>}
      <TopicActions onContinue={()=>onContinueToResearch(debateSide)} onGenerate={startShuffle} onReroll={startShuffle} hasTopic={Boolean(selectedTopic)} canGenerate={Boolean(topics.length)} isShuffling={isShuffling} canContinue={topicType!=='debate' || debateSide!==null} showFavorite={showFavorite} isFavorite={isFavorite} onToggleFavorite={onToggleFavorite}/>
    </section>
  );
}

