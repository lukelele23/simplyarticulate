import {useEffect,useState} from 'react';
import DailyTopicVote from '../components/DailyTopicVote.jsx';

export default function TopicVotingScreen({user,onSignUp}) {
 const [day,setDay]=useState(()=>new Date().toISOString().slice(0,10));
 useEffect(()=>{
  const timer=setInterval(()=>setDay(new Date().toISOString().slice(0,10)),30000);
  return()=>clearInterval(timer);
 },[]);
 return <div className="topic-voting-screen">
  <DailyTopicVote key={user?.id||'guest'} user={user} day={day} publicView onSignUp={onSignUp}/>
 </div>;
}
