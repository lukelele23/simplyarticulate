import {challengeDay} from '../lib/challengeDay.js';
import {useEffect,useState} from 'react';
import DailyTopicVote from '../components/DailyTopicVote.jsx';

export default function TopicVotingScreen({user,onSignUp}) {
 const [day,setDay]=useState(()=>challengeDay());
 useEffect(()=>{
  const timer=setInterval(()=>setDay(challengeDay()),30000);
  return()=>clearInterval(timer);
 },[]);
 return <div className="topic-voting-screen">
  <DailyTopicVote key={user?.id||'guest'} user={user} day={day} publicView onSignUp={onSignUp}/>
 </div>;
}
