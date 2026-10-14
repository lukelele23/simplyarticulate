export default function PracticeStages({current='topic',includePreparation=false}) {
 const stages=[['topic','Topic'],...(includePreparation?[['prepare','Prepare']]:[]),['speak','Speak'],['review','Review']];
 const active=stages.findIndex(([id])=>id===current);
 return <nav className="practice-stages" aria-label="Practice stages"><ol>{stages.map(([id,label],index)=><li key={id} className={index<active?'is-complete':''} aria-current={id===current?'step':undefined}><span className="practice-stage-dot" aria-hidden="true"/><span>{label}</span>{index<active&&<span className="sr-only"> completed</span>}</li>)}</ol></nav>;
}

