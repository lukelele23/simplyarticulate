// Daily challenges use fixed Eastern Standard Time (UTC-5), including summer.
const OFFSET=5*60*60*1000;
export function challengeDay(time=Date.now()){return new Date(new Date(time).getTime()-OFFSET).toISOString().slice(0,10);}
export function nextChallengeDay(time=Date.now()){return new Date(Date.parse(challengeDay(time)+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
export function challengeDayStart(day){return new Date(day+'T00:00:00-05:00').toISOString();}
