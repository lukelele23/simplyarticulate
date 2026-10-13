import {useCallback,useEffect,useState,useRef} from 'react';
import {routeFor,screenPaths} from '../lib/navigation.js';
export default function useAppNavigation(){
 const [route,setRoute]=useState(()=>routeFor(location.pathname));
 const previous=useRef(history.state?.returnPath||'/home');
 const navigate=useCallback((path,replace=false)=>{
  const old=routeFor(location.pathname);
  if(old.screen==='difficulty'&&old.path!=='/')previous.current=old.path;
  if(location.pathname!==path){history[replace?'replaceState':'pushState']({returnPath:previous.current},'',path);}
  setRoute(routeFor(path));
 },[]);
 useEffect(()=>{const pop=()=>{previous.current=history.state?.returnPath||previous.current;setRoute(routeFor(location.pathname));};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
 const setScreen=useCallback(screen=>navigate(screen==='difficulty'?previous.current:screenPaths[screen]||'/home'),[navigate]);
 return {screen:route.screen,setScreen,view:route.view,navigate,backLabel:'Back to '+(routeFor(previous.current).view.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase()))};
}
