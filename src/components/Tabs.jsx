export default function Tabs({ difficulty, onDifficultyChange, topicType, onTopicTypeChange }) {
  return (
    <div className="practice-choice-groups">
      <fieldset className="practice-control-group">
        <legend>Practice mode</legend>
        <div className="skill-options">
          {["speech", "research", "debate"].map((mode) => (
            <button
              key={mode}
              aria-pressed={topicType === mode}
              onClick={() => onTopicTypeChange(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="practice-control-group">
        <legend>Difficulty</legend>
        <div className="skill-options">
          {["easy", "medium", "hard"].map((level) => (
            <button
              key={level}
              aria-pressed={difficulty === level}
              onClick={() => onDifficultyChange(level)}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
