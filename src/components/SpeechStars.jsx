import {useEffect,useRef,useState} from 'react';
import './speechStars.css';
const revealed=new Set();
export default function SpeechStars({rating,animate=false,resultId}){
 const ref=useRef(null),[visible,setVisible]=useState(false),[play,setPlay]=useState(false);
 useEffect(()=>{
  if(!animate||!Number.isInteger(rating?.stars)||!ref.current)return;
  const key=resultId||String(rating.stars)+rating.reason;
  if(revealed.has(key)){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){revealed.add(key);setPlay(true);setVisible(true);observer.disconnect();}},{threshold:.3});
  observer.observe(ref.current);return()=>observer.disconnect();
 },[animate,resultId,rating?.stars]);
 if(!Number.isInteger(rating?.stars)||rating.stars<0||rating.stars>10)return null;
 return <section ref={ref} className={'speech-rating'+(animate&&!visible?' is-waiting':animate&&visible&&play?' is-revealing':'')} aria-label={rating.stars+' out of 10 stars'}>
 <h3>Coach rating: {rating.stars}/10 stars</h3><div className="speech-stars" aria-hidden="true">{Array.from({length:10},(_,i)=><span key={i} className={i<rating.stars?'earned':''} style={{'--star-delay':i*110+'ms'}}>★</span>)}</div>{rating.reason&&<p>{rating.reason}</p>}{animate&&visible&&<span className="sr-only" role="status">You earned {rating.stars} out of 10 stars for this take.</span>}</section>;
}
