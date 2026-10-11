// Practice design: curated tasks stay independent of database schema.
export const SKILLS = ['Clarity', 'Storytelling', 'Persuasion', 'Work'];
export const PROMPTS = {
 Clarity: ['Explain a useful everyday skill to a complete beginner. Use one concrete example.', 'Explain a small change that made your day easier. Start with the main point.', 'Describe a place you love to someone who has never visited. Make it easy to picture.'],
 Storytelling: ['Tell a friend about a small mistake that taught you something. End with what changed.', 'Describe a moment when someone surprised you with kindness. Set the scene, then explain why it mattered.', 'Tell the story of trying something for the first time. Give it a beginning, middle, and end.'],
 Persuasion: ['Convince a skeptical friend to try one habit that helped you. Give one concrete example.', 'Defend an unpopular everyday preference. Acknowledge one reasonable objection.', 'Recommend one improvement to your neighborhood. Explain who it would help and why.'],
 Work: ['Give your team a concise update about a delayed project. Explain the next step.', 'Answer an interview question about solving a difficult problem. Describe your own contribution.', 'Explain an idea to a busy colleague. State your recommendation before the details.']
};
export function dayKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-'); }
export function dailyPrompt(date = new Date()) {
 const day = Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()) / 86400000);
 const skill = SKILLS[((day % SKILLS.length)+SKILLS.length)%SKILLS.length];
 return { id: date.toISOString().slice(0,10), skill, topic: PROMPTS[skill][Math.floor(day/SKILLS.length)%PROMPTS[skill].length] };
}
export function selectDailyTopic(rows, date = new Date()) {
 const topics = rows.filter(row => row && row.id != null && typeof row.topic === 'string' && row.topic.trim());
 if (!topics.length) return null;
 const day = Math.floor(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()) / 86400000);
 const index = ((day % topics.length) + topics.length) % topics.length;
 return topics[index];
}
export function pickFresh(topics, recent = [], random = Math.random) {
 const fresh = topics.filter(t => !recent.includes(t));
 const pool = fresh.length ? fresh : topics.filter(t => t !== recent.at(-1));
 const available = pool.length ? pool : topics;
 return available.length ? available[Math.floor(random()*available.length)] : null;
}
export function weeklyDays(sessions, now = new Date()) {
 const dates = new Set();
 for (let i=0;i<7;i++) { const date=new Date(now); date.setDate(date.getDate()-i); dates.add(dayKey(date)); }
 return new Set(sessions.filter(s=>dates.has(s.date)).map(s=>s.date)).size;
}
