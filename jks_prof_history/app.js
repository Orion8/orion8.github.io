const copy = {
ko: {profileHeading:'게임 속 세계에서, 현실 너머로.',sourceNote:'2024년 이력서 기준 · 마지막 기재 경력: 2024년 4월. 연도만 확인된 기간은 연도만 표시합니다.',education:'학력',educationHeading:'세계를 만드는 기초.',award:'수상',logoSource:'로고 자료 보기',details:'맡은 일 자세히 보기',skip:'본문으로 건너뛰기',navAbout:'소개',navJourney:'경력',navProjects:'프로젝트',navContact:'연락처',heroTitle:'한 걸음씩,\n이야기가 되다.',heroDescription:'지나온 시간과 만들어가는 것들.\n1996년 8월에서 시작된, 아직 쓰고 있는 이야기.',start:'첫 페이지 펼치기',heroNote:'모든 여정은 작은 시작에서.',artCaption:'시작과 그 너머의 풍경',heroFoot:'경력의 발자취, 호기심의 기록',scroll:'아래로, 다음 장으로 ↓',journeyTitle:'시간을 따라 걷다.',journeyIntro:'하나의 시작에서, 여러 개의 장으로.\n지나온 경력을 시간 순서대로 기록합니다.',continuation:'이야기는 다음 장으로 이어집니다.',careerNote:'2024년 4월 이후의 경력과 현재 프로젝트는 확인 후 추가합니다.',projectsTitle:'이야기 밖의 작은 세계들.',projectsIntro:'공개된 작업에서 골라온 작은 기록들.\n각자의 공간에서 직접 만나보세요.',galleryNote:'공개 프로젝트 모음에서 확인한 작업입니다. 현재 사이드 프로젝트와 이미지는 추가로 소개할 예정입니다.',contactTitle:'다음 이야기가\n만나는 곳.',contactIntro:'프로젝트와 새로운 이야기를 나눠주세요.',github:'GitHub에서 만나기',footer:'1996.08 — 지금, 그리고 다음 장.',back:'맨 위로 ↑',demo:'실행하기 ↗',video:'영상 보기 ↗',title:'Keeseok Jeong · Orion8 — 이어지는 이야기',description:'1996년 8월부터 이어지는 Orion8의 경력 이야기와 프로젝트 모음.',error:'목록을 불러오지 못했습니다. 새로고침하여 다시 시도해 주세요.'},
en: {profileHeading:'From game worlds to mixed reality.',sourceNote:'Based on the 2024 résumé · Latest listed role ends April 2024. Year-only dates retain their original precision.',education:'EDUCATION',educationHeading:'Foundations for building worlds.',award:'AWARD',logoSource:'View logo source',details:'Explore contributions',skip:'Skip to content',navAbout:'About',navJourney:'Journey',navProjects:'Projects',navContact:'Contact',heroTitle:'One step.\nAnother story.',heroDescription:'A collection of things made and paths taken.\nAn unfolding story that began in August 1996.',start:'Open the first page',heroNote:'Every journey begins with a little step.',artCaption:'A beginning, and the landscape beyond',heroFoot:'Footsteps of a career. Notes of curiosity.',scroll:'Scroll to the next chapter ↓',journeyTitle:'A walk through time.',journeyIntro:'From a single beginning to many chapters.\nA professional journey, recorded in order.',continuation:'The story continues into its next chapter.',careerNote:'Career updates after April 2024 and current projects will be added when confirmed.',projectsTitle:'Little worlds along the way.',projectsIntro:'A selection from a public collection.\nVisit each one in its own space.',galleryNote:'These works are verified in the public project collection. Current side projects and images will be introduced later.',contactTitle:'Where the next\nstory begins.',contactIntro:'Get in touch about projects and the next story.',github:'Meet me on GitHub',footer:'AUG 1996 — Today, and the next chapter.',back:'Back to top ↑',demo:'Open project ↗',video:'Watch video ↗',title:'Keeseok Jeong · Orion8 — A continuing story',description:'A continuing professional journey since August 1996, and a collection of projects by Orion8.',error:'Unable to load the collection. Please refresh to try again.'}
};
const icons = {
liquid: '<path d="M45 15h70M45 125h70M50 18c0 35 50 35 50 62s-50 20-50 43" fill="none" stroke="#dfd5b0" stroke-width="8"/><path d="M50 18c0 35 50 35 50 62" fill="none" stroke="#d7a75c" stroke-width="8"/><circle cx="107" cy="31" r="4" fill="#ecc780"/><path d="m18 67 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#ecc780"/>',
memory: '<g fill="#f3ebd6" stroke="#756e51" stroke-width="1"><rect x="22" y="20" width="46" height="46" rx="4"/><rect x="80" y="20" width="46" height="46" rx="4"/><rect x="22" y="78" width="46" height="46" rx="4"/><rect x="80" y="78" width="46" height="46" rx="4"/></g><path d="m45 31 4 9 10 3-10 4-4 9-4-9-10-4 10-3Z" fill="#aa7048"/><circle cx="103" cy="101" r="11" fill="#486957"/><path d="m90 53 13-18 13 18Zm-58 58 13-19 13 19Z" fill="#87927a"/>',
};
let content; let language='ko';
try { const param = new URL(location.href).searchParams.get('lang'); language = ['ko','en'].includes(param) ? param : localStorage.getItem('portfolio-language') === 'en' ? 'en' : 'ko'; } catch {}
function el(tag, text, className) { const node=document.createElement(tag); if(text)node.textContent=text; if(className)node.className=className; return node; }
function link(url, label) { const a=el('a',label); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; return a; }
function render() {
 const t=copy[language]; document.documentElement.lang=language; document.title=t.title; document.querySelector('meta[name="description"]').content=t.description;
 document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t[node.dataset.i18n]; node.style.whiteSpace='pre-line';});
 document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
 if(!content)return;
 const profile=content.profile;
 document.querySelectorAll('[data-profile]').forEach(node=>{node.textContent=profile[node.dataset.profile][language];});
 const skills=document.querySelector('#skills');skills.replaceChildren(...profile.skills.map(skill=>el('li',skill)));
 const education=document.querySelector('#education-list');education.replaceChildren();
 content.education.forEach(item=>{const record=el('p',null,'education-record');record.append(el('strong',item.school),el('span',item.degree[language]));education.append(record);});
 document.querySelector('#award-heading').textContent=content.award.title[language];
 document.querySelector('#award-description').textContent=content.award.description[language];
 const timeline=document.querySelector('#timeline');
 const expanded=new Set([...timeline.querySelectorAll('details[open]')].map(item=>item.dataset.career));
 timeline.replaceChildren();
 function dateLabel(date) {
   if(date.length===4)return date;
   return new Intl.DateTimeFormat(language==='ko'?'ko-KR':'en-US',{year:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'-01T00:00:00Z'));
 }
 content.career.forEach(item=>{
   const article=el('article',null,'timeline-entry');
   const period=el('div',null,'career-period');
   const start=el('time',dateLabel(item.date));start.dateTime=item.date;
   const end=el('time',dateLabel(item.end));end.dateTime=item.end;
   period.append(start,el('span','—','period-separator'),end);
   const body=el('div',null,'career-body');
   const heading=el('div',null,'company-heading');
   heading.append(el('h3',item.title[language]));
   if(item.logo){
     const badge=link(item.logo.source,'');badge.className='company-logo';
     const label=item.title[language]+' · '+t.logoSource+' ('+item.logo.period+')';
     badge.setAttribute('aria-label',label);badge.title=label;
     const image=el('img');image.src=item.logo.path;image.alt='';image.loading='lazy';image.decoding='async';
     image.addEventListener('error',()=>badge.remove(),{once:true});
     if(item.logo.viewport){const viewport=el('span',null,'logo-viewport '+item.logo.viewport);viewport.append(image);badge.append(viewport);}else{badge.append(image);}
     heading.append(badge);
   }
   body.append(heading,el('p',item.role[language],'career-role'),el('p',item.location[language],'career-location'),el('p',item.description[language],'career-description'));
   const projects=el('ul',null,'career-projects');item.projects.forEach(project=>projects.append(el('li',project)));body.append(projects);
   const details=el('details');details.dataset.career=item.date;details.open=expanded.has(item.date);
   details.append(el('summary',t.details));const contributions=el('ul',null,'contributions');item.details.forEach(detail=>contributions.append(el('li',detail[language])));details.append(contributions);body.append(details);
   article.append(period,body);timeline.append(article);
 });
 const gallery=document.querySelector('#project-grid');gallery.replaceChildren();
 content.projects.forEach((item,index)=>{const article=el('article',null,'project-card');const visual=el('div',null,'project-visual '+item.id);if(item.thumbnail){const image=el('img');image.src=item.thumbnail;image.alt=item.title;image.loading='lazy';visual.append(image);}else{visual.innerHTML='<svg viewBox="0 0 150 150" aria-hidden="true">'+(icons[item.id]||icons.memory)+'</svg>'; }visual.append(el('span','0'+(index+1),'number'));const links=el('div',null,'project-links');links.append(link(item.repo,'GitHub ↗'));if(item.demo)links.append(link(item.demo,t.demo));if(item.video)links.append(link(item.video,t.video));article.append(visual,el('p',item.category[language],'project-category'),el('h3',item.title),el('p',item.description[language],'description'),links);gallery.append(article);});
}
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.lang;try{localStorage.setItem('portfolio-language',language);const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}catch{}render();}));
render();
try { const response=await fetch(new URL('./content.json',import.meta.url));if(!response.ok)throw new Error('Content unavailable');content=await response.json();render(); }catch{['#timeline','#project-grid'].forEach(selector=>{const p=el('p',copy[language].error);p.setAttribute('role','alert');document.querySelector(selector).append(p);});}
