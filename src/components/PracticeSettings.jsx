export default function PracticeSettings({ topicType, settings, onSettingsChange }) {
  const set = (name, value) => onSettingsChange({ ...settings, [name]: value });
  const formatDuration = (seconds) => {
    if (seconds === 0) return "Skip";
    if (seconds < 60) return `${seconds} sec`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`;
  };

  return (
    <div className="duration-groups">
      {topicType !== "debate" && (
        <fieldset className="practice-control-group">
          <legend>Preparation</legend>
          <div className="practice-duration-control">
            <output htmlFor="practice-prep-duration">{formatDuration(settings.researchSeconds)}</output>
            <input
              id="practice-prep-duration"
              className="practice-duration-range"
              type="range"
              min="0"
              max="300"
              step="15"
              value={settings.researchSeconds}
              style={{ "--range-progress": `${(settings.researchSeconds / 300) * 100}%` }}
              aria-label="Preparation time"
              aria-valuetext={formatDuration(settings.researchSeconds)}
              onChange={(event) => set("researchSeconds", Number(event.target.value))}
            />
            <div className="practice-duration-endpoints" aria-hidden="true">
              <span>Skip</span>
              <span>5 min</span>
            </div>
          </div>
        </fieldset>
      )}
      <fieldset className="practice-control-group">
        <legend>Speaking</legend>
        <div className="practice-duration-control">
          <output htmlFor="practice-speech-duration">{formatDuration(settings.speechSeconds)}</output>
          <input
            id="practice-speech-duration"
            className="practice-duration-range"
            type="range"
            min="30"
            max="300"
            step="30"
            value={settings.speechSeconds}
            style={{ "--range-progress": `${((settings.speechSeconds - 30) / 270) * 100}%` }}
            aria-label="Speaking time"
            aria-valuetext={formatDuration(settings.speechSeconds)}
            onChange={(event) => set("speechSeconds", Number(event.target.value))}
          />
          <div className="practice-duration-endpoints" aria-hidden="true">
            <span>30 sec</span>
            <span>5 min</span>
          </div>
        </div>
      </fieldset>
    </div>
  );
}


