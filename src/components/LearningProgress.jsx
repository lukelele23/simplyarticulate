import {recommendLearningFocus} from '../lib/learningFocus.js';
import './learningFocus.css';
export default function LearningProgress({sessions}){
 const {primary,ranked,personalized,reason}=recommendLearningFocus(sessions);
 const rated=sessions.filter(s=>Number.isInteger(s.rating?.stars)).sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
 const latest=rated[0];
 const comparable=latest?rated.filter(s=>s.topic===latest.topic&&s.format===latest.format&&s.difficulty===latest.difficulty&&s.goal===latest.goal).slice(0,5).reverse():[];
 const improvements=sessions.filter(s=>s.improvement?.status==='improved');
 return <section className="learning-progress"><h2>Your learning</h2>
  <article className="learning-focus-feature"><p className="eyebrow">{personalized?'YOUR NEXT FOCUS':'START HERE'}</p><h3>{primary.name}</h3><p>{reason}</p><p className="learning-focus-prompt">Try this: {primary.prompt}</p><ol>{primary.steps.map(step=><li key={step}>{step}</li>)}</ol></article>
  <details className="learning-focus-library"><summary>Explore all 10 learning focuses</summary><p>Ordered by your saved results. These are practice suggestions, not diagnoses or separate skill scores.</p><div className="learning-focus-grid">{ranked.map(focus=><article key={focus.id}><h3>{focus.name}</h3><small>{focus.score>0?'Suggested by your results':'Available to practice'}</small><p>{focus.prompt}</p><ol>{focus.steps.map(step=><li key={step}>{step}</li>)}</ol></article>)}</div></details>
  {comparable.length>0?<><p><strong>Comparable takes:</strong> {latest.topic}</p><p>{comparable.map(s=>s.rating.stars+'/10').join(' → ')}</p><small>Same topic, format, difficulty and goal. These ratings describe individual takes.</small></>:<p>Analyze a speech to begin your rating history.</p>}
  {improvements.length>0&&<><h3>Improvements you practiced</h3><ul>{improvements.slice(0,3).map(s=><li key={s.id}>{s.improvement.assessment}</li>)}</ul></>}
 </section>;
}
