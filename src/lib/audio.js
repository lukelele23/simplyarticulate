// PCM WAV avoids dependence on a browser's compressed-audio playback codecs.
export function pcmWave(chunks, inputRate, outputRate = 16000) {
  const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
  if (!length || !Number.isFinite(inputRate) || inputRate < outputRate) throw new Error('No playable audio captured.');
  const samples = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const count = Math.floor(length * outputRate / inputRate);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const text = (at, value) => { for (let i=0;i<value.length;i++) view.setUint8(at+i,value.charCodeAt(i)); };
  text(0,'RIFF'); view.setUint32(4,36+count*2,true); text(8,'WAVE'); text(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,outputRate,true); view.setUint32(28,outputRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  text(36,'data'); view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++) { const start=Math.floor(i*inputRate/outputRate), end=Math.min(length,Math.floor((i+1)*inputRate/outputRate)); let sum=0; for(let j=start;j<end;j++)sum+=samples[j]; const value=Math.max(-1,Math.min(1,sum/Math.max(1,end-start))); view.setInt16(44+i*2,value*(value<0?32768:32767),true); }
  return new Blob([buffer],{type:'audio/wav'});
}
