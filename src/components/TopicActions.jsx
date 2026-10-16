export default function TopicActions({onContinue,onGenerate,hasTopic=true,canGenerate=true,onReroll,isShuffling,canContinue=true}){
 return <div className="topic-actions">
  <button type="button" className="primary-button" onClick={hasTopic?onContinue:onGenerate} disabled={isShuffling||(hasTopic?!canContinue:!canGenerate)}>{isShuffling?'Choosing…':hasTopic?'Start practice':'Find my prompt'}{!isShuffling&&<span aria-hidden="true">→</span>}</button>
  {hasTopic&&<button type="button" className="secondary-button" onClick={onReroll} disabled={isShuffling}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" width="18" height="18"><path d="M15.5 6.5h2v-2m0 2-3-3a6 6 0 0 0-9.8 2M4.5 13.5h-2v2m0-2 3 3a6 6 0 0 0 9.8-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>{isShuffling?'Choosing…':'Another topic'}</button>}
 </div>;
}
