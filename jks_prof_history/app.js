const copy = {
ko: {focusTitle:'만들어가고 싶은 것들',careerSkillsLabel:'그동안 쌓아온 기술',applicationIntro:'직접 실행하는 앱과 도구.',knowledgeIntro:'지식과 학습을 위한 프로젝트.',emptyProjects:'아직 등록된 프로젝트가 없습니다.',hobbyFooter:'작은 호기심으로 만드는 나의 취미 프로젝트.',hobbyDescription:'Keeseok Jeong의 취미 프로젝트. 작은 도구와 인터랙티브 실험을 만나보세요.',profileHeading:'AI와 함께, 호기심을 창작으로.',sourceNote:'2024년 이력서 기준 · 마지막 기재 경력: 2024년 4월. 연도만 확인된 기간은 연도만 표시합니다.',education:'학력',educationHeading:'세계를 만드는 기초.',award:'수상',logoSource:'로고 자료 보기',details:'맡은 일 자세히 보기',skip:'본문으로 건너뛰기',navAbout:'소개',navJourney:'경력',navProjects:'취미 프로젝트',navContact:'연락처',heroTitle:'한 걸음씩,\n이야기가 되다.',heroDescription:'지나온 경험에 새로운 도구를 더해,\n만들고 싶었던 것들을 하나씩.',start:'첫 페이지 펼치기',heroNote:'모든 여정은 작은 시작에서.',artCaption:'시작과 그 너머의 풍경',heroFoot:'지나온 경험과 앞으로의 창작',scroll:'아래로, 다음 장으로 ↓',journeyTitle:'시간을 따라 걷다.',journeyIntro:'하나의 시작에서, 여러 개의 장으로.\n지나온 경력을 시간 순서대로 기록합니다.',continuation:'이야기는 다음 장으로 이어집니다.',careerNote:'2024년 4월 이후의 경력은 확인 후 추가합니다.',projectsTitle:'나의 취미 프로젝트',projectsIntro:'직접 만드는 앱과 도구, 배우고 탐구하는 프로젝트.\nApplication과 Knowledge로 나누어 소개합니다.',galleryNote:'각 프로젝트의 GitHub와 실행 링크에서 자세히 살펴볼 수 있습니다.',contactTitle:'다음 이야기가\n만나는 곳.',contactIntro:'프로젝트와 새로운 이야기를 나눠주세요.',github:'GitHub에서 만나기',footer:'1996.08 — 지금, 그리고 다음 장.',back:'맨 위로 ↑',demo:'실행하기 ↗',video:'영상 보기 ↗',title:'Keeseok Jeong · Orion8 — 이어지는 이야기',description:'AI 도구를 활용한 게임·앱·영상·음악과 시각적 지식 탐구. Keeseok Jeong의 창작 방향과 경력 이야기.',error:'목록을 불러오지 못했습니다. 새로고침하여 다시 시도해 주세요.'},
en: {focusTitle:'What I want to create',careerSkillsLabel:'Tools & skills from my career',applicationIntro:'Apps and tools you can use.',knowledgeIntro:'Projects for knowledge and learning.',emptyProjects:'No projects have been added yet.',hobbyFooter:'Little projects, made out of curiosity.',hobbyDescription:'Hobby projects by Keeseok Jeong: little tools and interactive experiments.',profileHeading:'Turning curiosity into creation, with AI.',sourceNote:'Based on the 2024 résumé · Latest listed role ends April 2024. Year-only dates retain their original precision.',education:'EDUCATION',educationHeading:'Foundations for building worlds.',award:'AWARD',logoSource:'View logo source',details:'Explore contributions',skip:'Skip to content',navAbout:'About',navJourney:'Journey',navProjects:'Hobby Projects',navContact:'Contact',heroTitle:'One step.\nAnother story.',heroDescription:'Building on years of experience,\nexploring what I can create with AI tools.',start:'Open the first page',heroNote:'Every journey begins with a little step.',artCaption:'A beginning, and the landscape beyond',heroFoot:'Experience behind me. New creations ahead.',scroll:'Scroll to the next chapter ↓',journeyTitle:'A walk through time.',journeyIntro:'From a single beginning to many chapters.\nA professional journey, recorded in order.',continuation:'The story continues into its next chapter.',careerNote:'Career updates after April 2024 will be added when confirmed.',projectsTitle:'My Hobby Projects',projectsIntro:'Apps and tools I build, and projects I learn with.\nExplore Application and Knowledge.',galleryNote:'Follow the GitHub and live project links to explore each project.',contactTitle:'Where the next\nstory begins.',contactIntro:'Get in touch about projects and the next story.',github:'Meet me on GitHub',footer:'AUG 1996 — Today, and the next chapter.',back:'Back to top ↑',demo:'Open project ↗',video:'Watch video ↗',title:'Keeseok Jeong · Orion8 — A continuing story',description:'Keeseok Jeong explores creation with AI tools: games, useful apps, video, music, and visual knowledge, built on a career since 1996.',error:'Unable to load the collection. Please refresh to try again.'}
};
const icons = {
liquid: '<path d="M45 15h70M45 125h70M50 18c0 35 50 35 50 62s-50 20-50 43" fill="none" stroke="#dfd5b0" stroke-width="8"/><path d="M50 18c0 35 50 35 50 62" fill="none" stroke="#d7a75c" stroke-width="8"/><circle cx="107" cy="31" r="4" fill="#ecc780"/><path d="m18 67 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#ecc780"/>',
memory: '<g fill="#f3ebd6" stroke="#756e51" stroke-width="1"><rect x="22" y="20" width="46" height="46" rx="4"/><rect x="80" y="20" width="46" height="46" rx="4"/><rect x="22" y="78" width="46" height="46" rx="4"/><rect x="80" y="78" width="46" height="46" rx="4"/></g><path d="m45 31 4 9 10 3-10 4-4 9-4-9-10-4 10-3Z" fill="#aa7048"/><circle cx="103" cy="101" r="11" fill="#486957"/><path d="m90 53 13-18 13 18Zm-58 58 13-19 13 19Z" fill="#87927a"/>',
};
let content; let language='ko';
try { const param = new URL(location.href).searchParams.get('lang'); language = ['ko','en'].includes(param) ? param : localStorage.getItem('portfolio-language') === 'en' ? 'en' : 'ko'; } catch {}
function el(tag, text, className) { const node=document.createElement(tag); if(text)node.textContent=text; if(className)node.className=className; return node; }
function link(url, label) { const a=el('a',label); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; return a; }
document.querySelectorAll('a[href^="./"]').forEach(anchor=>anchor.setAttribute('data-page-link',anchor.getAttribute('href')));
function render() {
 const t=copy[language]; const hobbies=document.body.dataset.page==='hobbies';
 document.documentElement.lang=language;
 document.title=hobbies ? t.projectsTitle+' — Keeseok Jeong · Orion8' : t.title;
 document.querySelector('meta[name="description"]').content=hobbies ? t.hobbyDescription : t.description;
 try { localStorage.setItem('portfolio-language',language); } catch {}
 document.querySelectorAll('a[data-page-link]').forEach(anchor=>{
   const href=anchor.getAttribute('data-page-link');
   if(href){const url=new URL(href,location.href);url.searchParams.set('lang',language);anchor.href=url.href;}
 });
 document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t[node.dataset.i18n]; node.style.whiteSpace='pre-line';});
 document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
 if(!content)return;
 if(document.querySelector('#timeline')){
 const profile=content.profile;
 document.querySelectorAll('[data-profile]').forEach(node=>{node.textContent=profile[node.dataset.profile][language];});
 const focus=document.querySelector('#creator-focus');focus.replaceChildren();
 profile.focus.forEach((item,index)=>{
   const row=el('li',null,'focus-item');
   const number=el('span',String(index+1).padStart(2,'0'),'focus-number');number.setAttribute('aria-hidden','true');
   const body=el('div');body.append(el('h4',item.title[language]),el('p',item.description[language]));row.append(number,body);focus.append(row);
 });
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
 }
 const gallery=document.querySelector('#project-grid');
 if(gallery){
   gallery.replaceChildren();
   for(const type of ['application','knowledge']){
     const group=el('section',null,'project-group');group.id=type;
     group.setAttribute('aria-labelledby',type+'-heading');
     const heading=el('h2',type==='application'?'Application':'Knowledge');heading.id=type+'-heading';
     const intro=el('p',t[type+'Intro'],'project-type-intro');
     const grid=el('div',null,'project-grid');
     const projects=content.projects.filter(item=>item.type===type);
     projects.forEach((item,index)=>{
       const article=el('article',null,'project-card');
       const visual=el('div',null,'project-visual '+item.id);
       if(item.thumbnail){const image=el('img');image.src=item.thumbnail;image.alt=item.title;image.loading='lazy';visual.append(image);}
       else{visual.innerHTML='<svg viewBox="0 0 150 150" aria-hidden="true">'+(icons[item.id]||icons.memory)+'</svg>';}
       visual.append(el('span',String(index+1).padStart(2,'0'),'number'));
       const links=el('div',null,'project-links');links.append(link(item.repo,'GitHub ↗'));
       if(item.demo)links.append(link(item.demo,t.demo));if(item.video)links.append(link(item.video,t.video));
       article.append(visual,el('p',item.category[language],'project-category'),el('h3',item.title),el('p',item.description[language],'description'),links);
       grid.append(article);
     });
     if(!projects.length)grid.append(el('p',t.emptyProjects,'empty-projects'));
     group.append(heading,intro,grid);gallery.append(group);
   }
 }
}
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.lang;try{localStorage.setItem('portfolio-language',language);const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}catch{}render();}));
if(location.hash==='#projects' && document.body.dataset.page!=='hobbies'){
 const destination=new URL('./projects.html',location.href);destination.searchParams.set('lang',language);location.replace(destination.href);
}else{
render();
try { const contentUrl=new URL('./content.json',import.meta.url);contentUrl.search=new URL(import.meta.url).search;const response=await fetch(contentUrl);if(!response.ok)throw new Error('Content unavailable');content=await response.json();render(); }catch{['#timeline','#project-grid'].forEach(selector=>{const p=el('p',copy[language].error);p.setAttribute('role','alert');document.querySelector(selector)?.append(p);});}

}
