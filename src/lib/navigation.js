export const MAIN_VIEWS = ['home','practice','daily-challenge','progress','speech-debate','subscription'];
export function routeFor(path) {
 const clean=path.replace(/\/$/,'')||'/';
 const view=clean.slice(1);
 if(MAIN_VIEWS.includes(view))return {screen:'difficulty',view,path:clean};
 const screens={'/welcome':'welcome','/settings':'settings','/recordings':'recordings','/practice/record':'timer','/practice/prepare':'research-timer','/practice/review':'review','/sign-in':'signup'};
 if(clean==='/')return {screen:'difficulty',view:'home',path:clean};
 return {screen:screens[clean]||'not-found',view:'home',path:clean};
}
export const screenPaths={welcome:'/welcome',settings:'/settings',recordings:'/recordings',timer:'/practice/record','research-timer':'/practice/prepare',review:'/practice/review',signup:'/sign-in',stats:'/progress'};
