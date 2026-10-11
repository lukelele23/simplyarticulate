import { fillerRate, nextStep } from './reports.js';
export const EXERCISES=[
  {id:'opening',name:'Lead with the point',pattern:/opening|main point|concise|clear|clarity/i,prompt:'Explain one helpful habit to a busy friend.',steps:['State your main point in one sentence.','Give one concrete example.','Finish by repeating the takeaway.']},
  {id:'support',name:'Support a claim',pattern:/support|evidence|claim|example|argument|reason/i,prompt:'Recommend one change that would improve your neighborhood.',steps:['State your recommendation.','Give one specific example and explain why it supports your point.','Acknowledge one reasonable objection.']},
  {id:'story',name:'Tell a short story',pattern:/story|structure|organization|sequence|conclusion/i,prompt:'Tell a story about a small mistake that taught you something.',steps:['Describe the setting and the problem.','Explain what you did.','End with what changed.']},
  {id:'work',name:'Answer an interview question',pattern:/interview|work|contribution|project|colleague/i,prompt:'Describe a difficult problem you helped solve.',steps:['Give the situation and your task.','Explain your own action.','Describe the result and one lesson.']}
];
export function practiceInsights(sessions) {
  const analyzed=sessions.filter(s=>s.analysis?.metrics && !s.analysis.demo).sort((a,b)=>(a.createdAt||a.date).localeCompare(b.createdAt||b.date));
  const mentions=EXERCISES.map(exercise=>({...exercise,count:analyzed.filter(s=>exercise.pattern.test(nextStep(s.analysis))).length})).sort((a,b)=>b.count-a.count);
  return {analyzed,minutes:Math.round(sessions.reduce((sum,s)=>sum+(Number(s.durationSeconds)||0),0)/60),plan:mentions[0]?.count?mentions[0]:EXERCISES[0],rates:analyzed.map(s=>fillerRate(s.analysis.metrics))};
}
