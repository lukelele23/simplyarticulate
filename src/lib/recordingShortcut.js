export function recordingShortcut(event,state){
 if(event.code!=='Space'||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented)return null;
 if(event.target?.closest?.('input,textarea,select,button,a,audio,video,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="textbox"],[role="slider"],[role="combobox"]'))return null;
 if(state.blocked||state.secondsLeft<=0)return null;
 if(state.running)return state.fixedDuration?null:'pause';
 return state.started?'resume':'start';
}
