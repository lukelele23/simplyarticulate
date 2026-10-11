export function InputTimer({ value = 120, onChange }) {
  return (
    <label className="research-time-input">
      <span>Research time (seconds)</span>
      <input
        type="number"
        min="120"
        max="600"
        value={Math.min(600, Math.max(120, Number(value) || 120))}
        onChange={(event) => onChange?.(Math.min(600, Math.max(120, Number(event.target.value) || 120)))}
      />
    </label>
  );
}

export default InputTimer;

