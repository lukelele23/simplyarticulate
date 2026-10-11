import { useEffect, useRef, useState } from 'react';
export default function MicrophoneCheck({ disabled }) {
  const [running,setRunning]=useState(false),[level,setLevel]=useState(0),[error,setError]=useState('');
  const resource=useRef(null), generation=useRef(0);
  function stop(){generation.current++;const r=resource.current;resource.current=null;if(r){clearInterval(r.timer);clearTimeout(r.timeout);r.stream.getTracks().forEach(t=>t.stop());void r.context.close();}setRunning(false);setLevel(0);}
  useEffect(()=>{if(disabled)stop();},[disabled]);
  useEffect(()=>()=>{generation.current++;const r=resource.current;if(r){clearInterval(r.timer);clearTimeout(r.timeout);r.stream.getTracks().forEach(t=>t.stop());void r.context.close();}},[]);
  async function check(){
    const token=++generation.current;setError('');setRunning(true);
    let stream,context;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation.current!==token){stream.getTracks().forEach(t=>t.stop());return;}
      context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
      if(generation.current!==token){stream.getTracks().forEach(t=>t.stop());void context.close();return;}
      const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();source.connect(analyser);analyser.fftSize=1024;
      const data=new Float32Array(1024);const timer=setInterval(()=>{analyser.getFloatTimeDomainData(data);setLevel(Math.min(1,Math.sqrt(data.reduce((n,x)=>n+x*x,0)/data.length)*8));},100);
      resource.current={stream,context,timer,timeout:setTimeout(stop,15000)};
    }catch{stream?.getTracks().forEach(t=>t.stop());void context?.close();if(generation.current===token){setRunning(false);setError('Could not check the microphone. Check your browser permission and connected device.');}}
  }
  return <div className="microphone-check"><button className="secondary-button" disabled={disabled} onClick={running?stop:check}>{running?'Stop microphone check':'Check microphone'}</button>{running&&<><meter min="0" max="1" value={level} aria-label="Microphone input level"/><p role="status">Speak a few words and watch the level. This check records nothing and ends after 15 seconds.</p></>}{error&&<p role="alert">{error}</p>}</div>;
}
