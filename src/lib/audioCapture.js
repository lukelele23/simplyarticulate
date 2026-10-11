// A worklet runs sample capture off the UI thread. Compressed MediaRecorder
// remains usable if a browser cannot load the worklet.
export async function audioCapture(input) {
  const Context=window.AudioContext || window.webkitAudioContext;
  if(!Context)return null;
  let context,source,processor,silence;
  try {
    context=new Context();await context.resume();
    source=context.createMediaStreamSource(input);
    await context.audioWorklet.addModule(new URL('./capture-worklet.js',import.meta.url));
    processor=new AudioWorkletNode(context,'speech-capture');silence=context.createGain();silence.gain.value=0;
    const samples=[];let resolveFlush;
    processor.port.onmessage=({data})=>{if(data.type==='samples')samples.push(data.samples);if(data.type==='flushed')resolveFlush?.(true);};
    source.connect(processor);processor.connect(silence);silence.connect(context.destination);
    const flush=()=>new Promise(resolve=>{const timeout=setTimeout(()=>resolve(false),1500);resolveFlush=value=>{clearTimeout(timeout);resolve(value);};try{processor.port.postMessage({type:'flush'});}catch{clearTimeout(timeout);resolve(false);}});
    return {context,source,processor,silence,samples,flush};
  } catch {
    processor?.disconnect();source?.disconnect();silence?.disconnect();await context?.close().catch(()=>{});return null;
  }
}
