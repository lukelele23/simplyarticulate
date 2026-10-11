export const DEBATE_FORMATS = {
  ld: {
    id: "ld",
    name: "Lincoln–Douglas",
    prepSeconds: 4 * 60,
    prepLabel: "per debater",
    segments: [
      { label: "Affirmative Constructive", shortLabel: "AC", side: "Affirmative", seconds: 6 * 60 },
      { label: "Cross-Examination", shortLabel: "CX", side: "Negative questions Affirmative", seconds: 3 * 60 },
      { label: "Negative Constructive", shortLabel: "NC", side: "Negative", seconds: 7 * 60 },
      { label: "Cross-Examination", shortLabel: "CX", side: "Affirmative questions Negative", seconds: 3 * 60 },
      { label: "First Affirmative Rebuttal", shortLabel: "1AR", side: "Affirmative", seconds: 4 * 60 },
      { label: "Negative Rebuttal", shortLabel: "NR", side: "Negative", seconds: 6 * 60 },
      { label: "Second Affirmative Rebuttal", shortLabel: "2AR", side: "Affirmative", seconds: 3 * 60 },
    ],
  },
  pf: {
    id: "pf",
    name: "Public Forum",
    prepSeconds: 3 * 60,
    prepLabel: "per team",
    segments: [
      { label: "Team A Constructive", shortLabel: "Constructive", side: "Team A", seconds: 4 * 60 },
      { label: "Team B Constructive", shortLabel: "Constructive", side: "Team B", seconds: 4 * 60 },
      { label: "Crossfire", shortLabel: "Crossfire", side: "Both teams", seconds: 3 * 60 },
      { label: "Team A Rebuttal", shortLabel: "Rebuttal", side: "Team A", seconds: 4 * 60 },
      { label: "Team B Rebuttal", shortLabel: "Rebuttal", side: "Team B", seconds: 4 * 60 },
      { label: "Crossfire", shortLabel: "Crossfire", side: "Both teams", seconds: 3 * 60 },
      { label: "Team A Summary", shortLabel: "Summary", side: "Team A", seconds: 3 * 60 },
      { label: "Team B Summary", shortLabel: "Summary", side: "Team B", seconds: 3 * 60 },
      { label: "Grand Crossfire", shortLabel: "Grand Crossfire", side: "Both teams", seconds: 3 * 60 },
      { label: "Team A Final Focus", shortLabel: "Final Focus", side: "Team A", seconds: 2 * 60 },
      { label: "Team B Final Focus", shortLabel: "Final Focus", side: "Team B", seconds: 2 * 60 },
    ],
  },
};

export function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
