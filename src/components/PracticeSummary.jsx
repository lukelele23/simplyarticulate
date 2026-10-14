const modes={speech:'Speech',research:'Research',debate:'Debate'};
export default function PracticeSummary({topicType,difficulty,seconds}) {
 const duration=seconds<60?`${seconds} sec`:`${Math.floor(seconds/60)} min${seconds%60?` ${seconds%60} sec`:''}`;
 const segments=[{label:'Mode',value:modes[topicType]||'Speech',reserve:'Research'},{label:'Difficulty',value:difficulty?difficulty[0].toUpperCase()+difficulty.slice(1):'Difficulty',reserve:'Difficulty'},{label:'Speaking time',value:duration,reserve:'4 min 30 sec'}];
 return <p className="practice-summary-segments">{segments.map(({label,value,reserve},index)=><span className="practice-summary-segment" key={index}><span className="practice-summary-label">{label}</span><span className="practice-summary-reserve" aria-hidden="true">{reserve}</span><span className="practice-summary-value" key={value}>{value}</span></span>)}</p>;
}

