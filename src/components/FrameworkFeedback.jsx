function Issues({ items }) {
  return <ul>{items.map((item, index) => <li key={index}><blockquote>{item.quote}</blockquote><p>{item.explanation}</p><p><strong>Try:</strong> {item.suggestion}</p></li>)}</ul>;
}
const labels = { supported: 'Supported', contradicted: 'Contradicted', partially_supported: 'Partially supported', unverified: 'Unverified', not_checked: 'Not checked' };
export default function FrameworkFeedback({ coaching, onRetry, busy }) {
  const a = coaching.argumentLogic, s = coaching.structureLanguage;
  return <div className="analysis-coaching">
    <p>{coaching.summary}</p>
    <h3>Argument and logic</h3><p>{a.assessment}</p>
    {a.applicability === 'not_applicable' && <p className="analysis-muted">This transcript does not present an argument to evaluate.</p>}
    {a.strengths.length > 0 && <><h4>What worked</h4><ul>{a.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
    <h4>Rhetorical structure</h4><p>{a.rhetoricalStructure}</p>
    <h4>Persuasiveness</h4><p>{a.persuasiveness}</p>
    {a.issues.length > 0 && <><h4>Strengthen your argument</h4><Issues items={a.issues} /></>}
    {a.factChecks.length > 0 && <><h4>Facts and examples</h4><p className="analysis-muted">Verification covers selected claims. Each claim's label shows whether supporting sources were found.</p>
      {a.factChecks.map((claim, index) => <section key={index}><blockquote>{claim.claimQuote}</blockquote><strong>{labels[claim.status]}</strong><p>{claim.explanation}</p>{claim.correction && <p>Correction: {claim.correction}</p>}
        <ul>{claim.sourceIds.map(id => { const source = coaching.sources?.find(s => s.id === id); return source && <li key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>; })}</ul>
      </section>)}</>}
    {coaching.groundingMetadata?.searchEntryPoint?.renderedContent && <iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={coaching.groundingMetadata.searchEntryPoint.renderedContent} style={{width:'100%',border:0,minHeight:120}} />}
    <h3>Structure and language</h3><p>{s.assessment}</p>
    {s.strengths.length > 0 && <ul>{s.strengths.map((text,i)=><li key={i}>{text}</li>)}</ul>}
    {s.sentenceStructure.length > 0 && <><h4>Sentence construction</h4><Issues items={s.sentenceStructure} /></>}
    {s.wordChoice.length > 0 && <><h4>Word choice and vocabulary</h4><Issues items={s.wordChoice} /></>}
    <h4>Filler words and visible disfluencies</h4><p>{coaching.languageMetrics?.fillerCount ?? s.fillerOccurrences.length} observed filler occurrences.</p>
    <ul>{s.fillerOccurrences.map((item,i)=><li key={i}>“{item.quote}”</li>)}</ul>
    {s.visibleDisfluencies.length ? <ul>{s.visibleDisfluencies.map((item,i)=><li key={i}>“{item.quote}”: {item.explanation}</li>)}</ul> : <p>No repetitions or false starts are visible in this transcript.</p>}
    {s.transcriptLimitations.map((text,i)=><p className="analysis-muted" key={i}>{text}</p>)}
    <h3>Suggested revision</h3><p>{coaching.suggestedRevision}</p>
    <div className="feedback-focus"><h4>Your next step</h4><p>{coaching.nextStep}</p>{onRetry && <button className="primary-button" disabled={busy} onClick={()=>onRetry(coaching.nextStep)}>Practice this improvement</button>}</div>
  </div>;
}
