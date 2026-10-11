import { practiceInsights } from '../lib/insights.js';
import { fillerRate } from '../lib/reports.js';
function Trend({values,label}) {
  const points=values.map((value,i)=>({value,i})).filter(p=>Number.isFinite(p.value));
  if(points.length<2)return null;
  const low=Math.min(...points.map(p=>p.value)),high=Math.max(...points.map(p=>p.value));
  const coordinates=points.map(p=>`${15+p.i*270/Math.max(1,values.length-1)},${105-(p.value-low)*75/Math.max(1,high-low)}`).join(' ');
  return <figure><figcaption>{label} · {points[0].value} → {points.at(-1).value}</figcaption><svg className="trend-chart" viewBox="0 0 300 130" role="img" aria-label={`${label}: ${points.map(p=>p.value).join(', ')} in chronological order`}><path d="M15 15V110H290" fill="none" stroke="#687775"/><polyline points={coordinates} fill="none" stroke="#9bcaae" strokeWidth="3"/>{points.map(p=><circle key={p.i} cx={15+p.i*270/Math.max(1,values.length-1)} cy={105-(p.value-low)*75/Math.max(1,high-low)} r="4" fill="#9bcaae"/>)}<text x="15" y="126" fontSize="10" fill="#c1c7c9">Earlier takes</text><text x="235" y="126" fontSize="10" fill="#c1c7c9">Latest take</text></svg></figure>;
}
export default function ProgressInsights({ sessions, onPractice }) {
  const {analyzed,minutes,plan}=practiceInsights(sessions);
  const recent=analyzed.slice(-10);
  return <section className="progress-insights"><h2>Your speaking progress</h2><p>{minutes} practice minutes · {analyzed.length} analyzed takes</p>{recent.length?<><p>Recent takes, oldest first. Pace is descriptive; filler rates allow different speech lengths to be compared.</p><div className="trend-grid"><Trend values={recent.map(s=>s.analysis.metrics.wordsPerMinute)} label="Pace (words/min)"/><Trend values={recent.map(s=>fillerRate(s.analysis.metrics))} label="Fillers / 100 words"/></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Topic</th><th>Pace</th><th>Fillers / 100 words</th><th>Minutes</th></tr></thead><tbody>{recent.map(s=><tr key={s.id}><td>{s.date}</td><td>{s.topic}</td><td>{s.analysis.metrics.wordsPerMinute}</td><td>{fillerRate(s.analysis.metrics) ?? '—'}</td><td>{Math.round(s.analysis.metrics.durationSeconds/6)/10}</td></tr>)}</tbody></table></div></>:<p>Save feedback with your practice to see trends here.</p>}<h3>Your next practice plan: {plan.name}</h3><p>{plan.count?`This theme appears in ${plan.count} saved feedback ${plan.count===1?'report':'reports'}.`:'Start with a simple one-minute exercise.'}</p><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><button className="primary-button" onClick={()=>onPractice(plan)}>Practice this exercise</button></section>;
}
