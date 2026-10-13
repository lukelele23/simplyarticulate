import {nextStep} from '../lib/reports.js';
export default function LearningProgress({sessions}){
 const rated=sessions.filter(s=>Number.isInteger(s.rating?.stars));
 const latest=rated[0];
 const comparable=latest?rated.filter(s=>s.topic===latest.topic&&s.format===latest.format&&s.difficulty===latest.difficulty&&s.goal===latest.goal).slice(0,5).reverse():[];
 const improvements=sessions.filter(s=>s.improvement?.status==='improved');
 const focus=latest?.nextFocus || nextStep(sessions.find(s=>s.analysis?.coaching)?.analysis);
 return <section className="learning-progress"><h2>Your learning</h2><p><strong>Current focus:</strong> {focus||'Make your main point clear, then support it with one example.'}</p>{comparable.length>0?<><p><strong>Comparable takes:</strong> {latest.topic}</p><p>{comparable.map(s=>s.rating.stars+'/10').join(' → ')}</p><small>Same topic, format, difficulty and goal. These ratings describe individual takes.</small></>:<p>Analyze a speech to begin your rating history.</p>}{improvements.length>0&&<><h3>Improvements you practiced</h3><ul>{improvements.slice(0,3).map(s=><li key={s.id}>{s.improvement.assessment}</li>)}</ul></>}</section>;
}
