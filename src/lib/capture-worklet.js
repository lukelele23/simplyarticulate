class SpeechCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.enabled=false; this.buffer=new Float32Array(4096); this.used=0;
    this.port.onmessage=({data})=>{
      if(data.type==='recording')this.enabled=data.enabled;
      if(data.type==='flush'){this.enabled=false;this.flush();this.port.postMessage({type:'flushed'});}
    };
  }
  flush(){if(this.used){const samples=this.buffer.slice(0,this.used);this.port.postMessage({type:'samples',samples},[samples.buffer]);this.used=0;}}
  process(inputs){
    const channel=inputs[0]?.[0];
    if(this.enabled&&channel){for(const sample of channel){this.buffer[this.used++]=sample;if(this.used===this.buffer.length)this.flush();}}
    return true;
  }
}
registerProcessor('speech-capture',SpeechCapture);
