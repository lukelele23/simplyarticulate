export const LEARNING_FOCUSES = [
  {id:'main-point',name:'Lead with your main point',pattern:/main point|opening|lead with|thesis|central (idea|message)/i,prompt:'Recommend one small change that would improve your day.',steps:['Give your answer in the first sentence.','Add one reason.','Repeat the takeaway in different words.']},
  {id:'structure',name:'Organize your answer',pattern:/structur|organiz|sequence|rambl|logical order/i,prompt:'Explain how you learned a useful skill.',steps:['Name the skill and why it matters.','Describe two steps in order.','End with the result.']},
  {id:'concise',name:'Say more with fewer words',pattern:/concis|wordy|wordiness|redundan|repetit|shorten|unnecessary/i,prompt:'Explain your favorite activity to someone with only a minute.',steps:['Choose one message.','Remove repeated ideas and side details.','Finish when the message is complete.']},
  {id:'examples',name:'Make your examples specific',pattern:/example|concrete|specific detail|illustrat/i,prompt:'Describe a time a small decision made a difference.',steps:['Name the decision.','Describe one specific moment.','Explain how that moment supports your point.']},
  {id:'evidence',name:'Connect claims to evidence',pattern:/evidence|unsupported|support.{0,25}(claim|argument)|fact.check|source|reasoning/i,prompt:'Argue for one improvement to your neighborhood.',steps:['State one claim.','Give evidence you can support; acknowledge uncertainty.','Explain why the evidence supports the claim.']},
  {id:'transitions',name:'Connect your ideas smoothly',pattern:/transition|connect.{0,15}idea|link.{0,15}point|signpost|abrupt/i,prompt:'Compare two ways to spend a free afternoon.',steps:['Introduce the two options.','Use one clear comparison phrase.','Explain how the comparison leads to your choice.']},
  {id:'conclusion',name:'Finish with a clear takeaway',pattern:/conclu|ending|finish|takeaway|closing|wrap up/i,prompt:'Explain one lesson you would share with a younger student.',steps:['State the lesson.','Support it with one experience.','Close with one sentence the listener should remember.']},
  {id:'fillers',name:'Replace fillers with a pause',pattern:/filler|\bum\b|\buh\b|hesitat/i,prompt:'Describe a familiar place without rushing to fill every silence.',steps:['Speak one complete thought at a time.','Pause briefly when you need to choose a word.','Replay your take and notice where a pause helped.']},
  {id:'pace',name:'Find a comfortable pace',pattern:/pace|pacing|too fast|too slow|rush|speed/i,prompt:'Teach someone how to do a simple everyday task.',steps:['Use a comfortable conversational speed.','Pause between the steps.','Replay and check whether each step is easy to follow.']},
  {id:'precision',name:'Choose clear, precise words',pattern:/word choice|vague|vocabulary|jargon|precis|sentence construction|sentence structure/i,prompt:'Explain a topic you know well to a beginner.',steps:['Use familiar words.','Replace vague phrases with specific descriptions.','Keep each sentence focused on one idea.']},
];

export function recommendLearningFocus(sessions = []) {
  const seen = new Set();
  const recent = [...sessions].filter(s => s && !s.analysis?.demo)
    .sort((a,b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
    .filter(s => { if(s.id && seen.has(s.id))return false;if(s.id)seen.add(s.id);return true; })
    .filter(s => s.nextFocus || s.analysis?.coaching || s.analysis?.metrics).slice(0,20);
  const ranked = LEARNING_FOCUSES.map((focus, order) => {
    let score = 0, mentions = 0, metricSignals = 0;
    recent.forEach((session,index) => {
      const coaching = session.analysis?.coaching;
      // Match corrective guidance, never strengths or an overall star score.
      const guidance = [session.nextFocus || coaching?.nextStep || coaching?.nextExercise,
        ...(coaching?.improvements || []).filter(value => typeof value === 'string')].filter(Boolean).join(' ');
      const weight = Math.pow(.85,index);
      if(focus.pattern.test(guidance)){mentions++;score += 3 * weight;}
      const m = session.analysis?.metrics;
      if(m?.wordCount >= 40){
        const fillerSignal = focus.id === 'fillers' && Number.isFinite(m.fillerCount) && m.fillerCount / m.wordCount > .04;
        const paceSignal = focus.id === 'pace' && Number.isFinite(m.wordsPerMinute) && m.wordsPerMinute > 0 && (m.wordsPerMinute < 100 || m.wordsPerMinute > 180);
        if(fillerSignal || paceSignal){metricSignals++;score += weight;}
      }
      if(session.improvement?.status === 'improved' && focus.pattern.test(session.improvement.assessment || ''))score -= .5 * weight;
    });
    return {...focus,score:Math.max(0,score),mentions,metricSignals,order};
  }).sort((a,b) => b.score-a.score || a.order-b.order);
  const primary = ranked[0];
  const personalized = primary.score > 0;
  const reason = !personalized ? 'A starter exercise. Analyze a speech to personalize your next focus.' :
    primary.mentions ? `Recommended in ${primary.mentions} of your last ${recent.length} saved results. Recent results count more.` :
    `Suggested by ${primary.metricSignals} recent recording ${primary.metricSignals === 1 ? 'result' : 'results'}. Pace and filler measurements are guides, not a speaking grade.`;
  return {primary,ranked,personalized,reason,sampleSize:recent.length};
}
