/* ═══════════════════════════════════════════
   DEUTSCHGEO — FULL APPLICATION JS
   SRS · Audio · Achievements · Chart
   PWA · Keyboard · Import/Export
   Pagination (20/page) · Daily Phrases
   Structured Learning · Learned-only quizzes
═══════════════════════════════════════════ */

// ────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────
let state = {
  name:"", xp:0, streak:0, lastVisit:"",
  learnedWords:[],      // all words marked learned (easy + so-so)
  reinforceWords:[],    // so-so words that should reappear in study
  reviewWords:{},       // {de: {interval,due,ease,reps}}
  difficultWords:[],    // rated "hard" repeatedly
  priorityWords:[],     // words that must reappear soon
  favoriteWords:[],
  testsCompleted:0,
  lastPage:"home",
  theme:"default",
  flashCategory:"all",
  vocabFilter:"all",
  quizType:"de-ka",
  grammarViewed:0,
  perfectQuiz:0,
  unlockedAchievements:[],
  weeklyXP:{},          // {"YYYY-MM-DD": xp}
  currentVocabPage:1,
};

function saveState(){ localStorage.setItem("dg_state_v3", JSON.stringify(state)); }
function loadState(){
  const s = localStorage.getItem("dg_state_v3");
  if(s){ try{ state = {...state, ...JSON.parse(s)}; }catch(e){} }
}

// ────────────────────────────────────────────
// DATA
// ────────────────────────────────────────────
let VOCABULARY = [];
let DAILY_PHRASES = [];
let ACHIEVEMENTS_DEF = [];

function uniqueStrings(arr){
  return [...new Set((arr||[]).filter(Boolean))];
}
function normalizeWordDisplay(w){
  const de = (w?.de||"").trim();
  const article = (w?.article||"").trim();
  if(!article) return de;
  if(de.toLowerCase().startsWith(article.toLowerCase()+" ")) return de;
  return `${article} ${de}`;
}
function normalizeState(){
  const valid = new Set((VOCABULARY||[]).map(w=>w.de));
  state.difficultWords = uniqueStrings(state.difficultWords).filter(de=>valid.has(de));
  state.priorityWords = uniqueStrings(state.priorityWords).filter(de=>valid.has(de));
  state.favoriteWords = uniqueStrings(state.favoriteWords).filter(de=>valid.has(de));
  state.learnedWords = uniqueStrings(state.learnedWords).filter(de=>valid.has(de) && !state.difficultWords.includes(de));
  state.reinforceWords = uniqueStrings(state.reinforceWords)
    .filter(de=>valid.has(de) && state.learnedWords.includes(de) && !state.difficultWords.includes(de));
  for(const de of Object.keys(state.reviewWords||{})){
    if(!valid.has(de)) delete state.reviewWords[de];
  }
}

// ────────────────────────────────────────────
// SRS — SM-2 VARIANT
// ────────────────────────────────────────────
function getSRSData(de){
  return state.reviewWords[de] || {interval:0, due:null, ease:2.5, reps:0};
}
function dedupeVocab(list){
  const seen=new Set();
  return list.filter(w=>w && !seen.has(w.de) && (seen.add(w.de),true));
}
function getPriorityVocab(filterFn=()=>true){
  return dedupeVocab(
    state.priorityWords
      .map(de=>VOCABULARY.find(w=>w.de===de))
      .filter(Boolean)
      .filter(filterFn)
  );
}
function getLearnedSample(filterFn=()=>true, limit=8){
  return shuffle(
    getLearnedVocab()
      .filter(w=>!state.priorityWords.includes(w.de))
      .filter(filterFn)
  ).slice(0, limit);
}
function getReinforceVocab(filterFn=()=>true){
  return dedupeVocab(
    state.reinforceWords
      .map(de=>VOCABULARY.find(w=>w.de===de))
      .filter(Boolean)
      .filter(filterFn)
  );
}
function getReviewWords(filterFn=()=>true){
  return dedupeVocab([
    ...getPriorityVocab(filterFn),
    ...getDueWords().filter(filterFn),
    ...getUnstartedWords().filter(filterFn),
    ...getReinforceVocab(filterFn),
  ]);
}
function buildStudyPool(filterFn=()=>true){
  return shuffle(getReviewWords(filterFn));
}
function updateSRS(de, rating){
  // rating 0=hard,1=ok,2=easy
  let {interval,ease,reps} = getSRSData(de);

  const addUnique = (arr, val) => { if(!arr.includes(val)) arr.push(val); };
  const remove = (arr, val) => arr.filter(w=>w!==val);

  if(rating===0){
    interval = Math.max(1, Math.min(interval || 1, 1));
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    state.learnedWords = remove(state.learnedWords, de);
    state.reinforceWords = remove(state.reinforceWords, de);
    addUnique(state.difficultWords, de);
    state.priorityWords = [de, ...state.priorityWords.filter(w=>w!==de)];
  } else {
    reps++;
    if(rating===1){
      interval = reps===1 ? 1 : reps===2 ? 3 : Math.round(interval * ease);
      ease = Math.max(1.3, ease - 0.05);
      addUnique(state.reinforceWords, de);
    } else {
      interval = reps===1 ? 1 : reps===2 ? 4 : Math.round(interval * ease * 1.1);
      ease = Math.min(3.0, ease + 0.1);
      state.reinforceWords = remove(state.reinforceWords, de);
    }
    if(rating===2){
      addUnique(state.learnedWords, de);
      showToast(`✅ "${de}" ნასწავლად მოინიშნა!`);
    } else {
      addUnique(state.reinforceWords, de);
      showToast(`✅ "${de}" გასამეორებლად მოინიშნა!`);
    }
    state.difficultWords = remove(state.difficultWords, de);
    state.priorityWords = state.priorityWords.filter(w=>w!==de);
    checkAchievements();
  }

  const due = new Date();
  due.setDate(due.getDate()+interval);
  state.reviewWords[de] = {interval, due:due.toISOString(), ease, reps};
  saveState();
}

function isDue(de){
  const d=getSRSData(de);
  if(!d.due) return false;
  return new Date(d.due) <= new Date();
}
function getDueWords(){ return VOCABULARY.filter(w=>isDue(w.de)&&!state.learnedWords.includes(w.de)); }
function getLearnedVocab(){ return VOCABULARY.filter(w=>state.learnedWords.includes(w.de)); }
function getUnstartedWords(){ return VOCABULARY.filter(w=>!state.reviewWords[w.de]&&!state.learnedWords.includes(w.de)); }

// ────────────────────────────────────────────
// XP & LEVELS
// ────────────────────────────────────────────
const LEVEL_DEFS = [
  {from:0,next:100,label:"დონე 1 · Anfänger"},
  {from:100,next:300,label:"დონე 2 · Grundkenntnisse"},
  {from:300,next:600,label:"დონე 3 · Elementar (A1)"},
  {from:600,next:1000,label:"დონე 4 · Grundstufe (A2)"},
  {from:1000,next:1800,label:"დონე 5 · Mittelstufe (B1)"},
  {from:1800,next:3000,label:"დონე 6 · Oberstufe (B2)"},
  {from:3000,next:5000,label:"დონე 7 · Fortgeschritten (C1)"},
  {from:5000,next:9999,label:"დონე 8 · Meister (C2)"},
];
function getLevel(){ return LEVEL_DEFS.find(l=>state.xp<l.next)||LEVEL_DEFS[LEVEL_DEFS.length-1]; }

function addXP(amount, showMsg=true){
  state.xp += amount;
  const today = new Date().toISOString().split("T")[0];
  state.weeklyXP[today] = (state.weeklyXP[today]||0)+amount;
  saveState(); updateUI();
  if(showMsg) showToast(`+${amount} XP ⚡`);
}

// ────────────────────────────────────────────
// AUDIO TTS
// ────────────────────────────────────────────
function speak(text, rate=0.85){
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang="de-DE"; u.rate=rate;
  const vs = speechSynthesis.getVoices();
  const de = vs.find(v=>v.lang==="de-DE"||v.lang==="de-AT"||v.lang==="de-CH");
  if(de) u.voice=de;
  speechSynthesis.speak(u);
}

// ────────────────────────────────────────────
// ACHIEVEMENTS
// ────────────────────────────────────────────
function checkAchievements(){
  if(!ACHIEVEMENTS_DEF.length) return;
  ACHIEVEMENTS_DEF.forEach(ach=>{
    if(state.unlockedAchievements.includes(ach.id)) return;
    let met=false;
    const [key,val] = ach.condition.split(">=");
    const n = parseInt(val);
    if(key==="learnedWords") met=state.learnedWords.length>=n;
    else if(key==="streak") met=state.streak>=n;
    else if(key==="xp") met=state.xp>=n;
    else if(key==="testsCompleted") met=state.testsCompleted>=n;
    else if(key==="perfectQuiz") met=(state.perfectQuiz||0)>=n;
    else if(key==="favoriteWords") met=state.favoriteWords.length>=n;
    else if(key==="grammarViewed") met=(state.grammarViewed||0)>=n;
    if(met){
      state.unlockedAchievements.push(ach.id);
      if(ach.xp>0){ state.xp+=ach.xp; updateUI(); }
      saveState();
      showAchievementPopup(ach);
    }
  });
}
let _achTimer;
function showAchievementPopup(ach){
  const pop = document.getElementById("achievement-popup");
  if(!pop) return;
  pop.innerHTML=`<div class="ach-pop-title">🏆 მიღწევა განბლოკილია!</div>
    <div class="ach-pop-body">
      <div class="ach-pop-icon">${ach.icon}</div>
      <div><div class="ach-pop-name">${ach.name}</div><div class="ach-pop-desc">${ach.desc}</div></div>
    </div>`;
  pop.classList.add("show");
  clearTimeout(_achTimer);
  _achTimer = setTimeout(()=>pop.classList.remove("show"),4000);
}

// ────────────────────────────────────────────
// STREAK
// ────────────────────────────────────────────
function updateStreak(){
  const today = new Date().toDateString();
  if(state.lastVisit!==today){
    const yest = new Date(Date.now()-86400000).toDateString();
    state.streak = state.lastVisit===yest ? (state.streak||0)+1 : 1;
    state.lastVisit = today;
    return true;
  }
  return false;
}

// ────────────────────────────────────────────
// LOAD DATA & INIT
// ────────────────────────────────────────────
async function loadData(){
  try{
    const [vr,pr,ar] = await Promise.all([
      fetch("json/vocabulary.json"),
      fetch("json/daily_phrases.json"),
      fetch("json/achievements.json")
    ]);
    VOCABULARY = await vr.json();
    DAILY_PHRASES = await pr.json();
    ACHIEVEMENTS_DEF = await ar.json();
  }catch(e){
    console.warn("JSON fetch failed — using inline fallbacks");
    VOCABULARY = window.VOCAB_INLINE||[];
    DAILY_PHRASES = window.PHRASES_INLINE||[];
    ACHIEVEMENTS_DEF = window.ACH_INLINE||[];
  }
}

loadState();
applyTheme(state.theme||"default");

window.addEventListener("DOMContentLoaded", async ()=>{
  await loadData();
  if(!state.name){
    document.getElementById("welcome-overlay").style.display="flex";
  } else {
    document.getElementById("welcome-overlay").style.display="none";
    initApp();
  }
  document.getElementById("name-input").addEventListener("keydown", e=>{ if(e.key==="Enter") startApp(); });
  document.addEventListener("keydown", handleKeyboard);
  if(window.speechSynthesis) speechSynthesis.onvoiceschanged=()=>{};
});

function startApp(){
  const val = document.getElementById("name-input").value.trim();
  if(!val){ document.getElementById("name-input").style.borderColor="#f87171"; return; }
  state.name=val; updateStreak(); saveState();
  document.getElementById("welcome-overlay").style.display="none";
  initApp();
}

function initApp(){
  const streakUpdated = updateStreak();
  normalizeState();
  if(streakUpdated) saveState();
  buildCategories();
  buildSettings();
  renderDailyPhrase();
  renderVocab();
  renderGrammar();
  renderFlashcard();
  renderQuiz();
  renderTests();
  renderPhonetics();
  renderQuickLessons();
  renderWeeklyChart();
  renderAchievements();
  updateUI();
  navigate(state.lastPage||"home");
  checkAchievements();
}

// ────────────────────────────────────────────
// UI UPDATE
// ────────────────────────────────────────────
function updateUI(){
  const name = state.name||"სტუდენტი";
  const q = id => document.getElementById(id);
  if(q("header-greeting")) q("header-greeting").textContent=`გამარჯობა, ${name}!`;
  if(q("header-xp")) q("header-xp").textContent=`${state.xp} XP`;
  if(q("streak-display")) q("streak-display").textContent=`🔥 ${state.streak} დღე`;
  if(q("home-title")) q("home-title").textContent=`გამარჯობა, ${name}! 👋`;
  if(q("stat-words")) q("stat-words").textContent=state.learnedWords.length;
  if(q("stat-xp")) q("stat-xp").textContent=state.xp;
  if(q("stat-tests")) q("stat-tests").textContent=state.testsCompleted;
  if(q("stat-streak")) q("stat-streak").textContent=state.streak;
  if(q("rs-avatar")) q("rs-avatar").textContent=name[0].toUpperCase();
  if(q("rs-name")) q("rs-name").textContent=name;
  const lv = getLevel();
  if(q("rs-level")) q("rs-level").textContent=lv.label;
  if(q("rs-xp-cur")) q("rs-xp-cur").textContent=`${state.xp} XP`;
  if(q("rs-xp-next")) q("rs-xp-next").textContent=`${lv.next} XP`;
  const pct = Math.min(100,((state.xp-lv.from)/(lv.next-lv.from))*100);
  if(q("rs-xp-bar")) q("rs-xp-bar").style.width=pct+"%";
  if(q("name-setting")) q("name-setting").value=state.name;

  const due = getReviewWords().length;
  if(q("flash-due-badge")) q("flash-due-badge").textContent=due>0?due:"";

  const total=VOCABULARY.length;
  const learnedPct=total?Math.round((state.learnedWords.length/total)*100):0;
  if(q("home-progress-fill")) q("home-progress-fill").style.width=learnedPct+"%";
  if(q("home-progress-text")) q("home-progress-text").textContent=`${state.learnedWords.length} / ${total} სიტყვა ნასწავლია (${learnedPct}%)`;
}

// ────────────────────────────────────────────
// NAVIGATION
// ────────────────────────────────────────────
function navigate(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".rs-nav-item").forEach(i=>i.classList.remove("active"));
  const pg=document.getElementById("page-"+page);
  if(pg) pg.classList.add("active");
  const nav=document.querySelector(`[data-page="${page}"]`);
  if(nav) nav.classList.add("active");
  state.lastPage=page; saveState();
  closeAllSidebars();
  if(page==="flash") renderFlashcard();
  if(page==="quiz") renderQuiz();
  if(page==="vocab") renderVocab();
  if(page==="home"){ renderWeeklyChart(); renderDailyPhrase(); }
  if(page==="achievements") renderAchievements();
  if(page==="tests") renderTests();
}

// ────────────────────────────────────────────
// DAILY PHRASE
// ────────────────────────────────────────────
function renderDailyPhrase(){
  const el=document.getElementById("daily-phrase");
  if(!el||!DAILY_PHRASES.length) return;
  const idx=Math.floor(Date.now()/86400000)%DAILY_PHRASES.length;
  const p=DAILY_PHRASES[idx];
  el.innerHTML=`
    <div class="daily-phrase-label">📅 დღის ფრაზა</div>
    <div class="daily-phrase-de">${p.de}</div>
    <div class="daily-phrase-ka">${p.ka}</div>
    <div class="daily-phrase-phonetic">${p.phonetic}</div>
    <button class="learn-audio-btn" style="margin-top:10px;margin-bottom:0;" onclick="speak('${p.de.replace(/'/g,"\\'")}')">🔊 მოუსმინე</button>`;
}

// ────────────────────────────────────────────
// WEEKLY CHART
// ────────────────────────────────────────────
function renderWeeklyChart(){
  const el=document.getElementById("weekly-chart");
  if(!el) return;
  const days=["კვ","ო","სა","ო","ხ","პ","შ"];
  const today=new Date();
  let bars=[], maxXP=1;
  for(let i=6;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const key=d.toISOString().split("T")[0];
    const xp=state.weeklyXP[key]||0;
    if(xp>maxXP) maxXP=xp;
    bars.push({xp, label:days[d.getDay()], isToday:i===0});
  }
  el.innerHTML=bars.map(b=>`
    <div class="chart-bar-wrap">
      <div class="chart-val">${b.xp>0?b.xp:""}</div>
      <div class="chart-bar ${b.isToday?"today":""}" style="height:${Math.max(3,(b.xp/maxXP)*70)}px"></div>
      <div class="chart-label">${b.label}</div>
    </div>`).join("");
}

// ────────────────────────────────────────────
// CATEGORIES
// ────────────────────────────────────────────
const CATEGORIES_META={
  "მისალმება":{icon:"👋"},"ზოგადი":{icon:"💬"},"ადამიანი":{icon:"👤"},
  "ოჯახი":{icon:"👨‍👩‍👧"},"სახლი":{icon:"🏠"},"რიცხვები":{icon:"🔢"},
  "ფერები":{icon:"🎨"},"საჭმელ-სასმელი":{icon:"🍽️"},"კვირის დღეები":{icon:"📅"},
  "თვეები":{icon:"🗓️"},"ზმნები":{icon:"⚡"},"ზედსართავები":{icon:"✨"},
  "წინდებულები":{icon:"📍"},"ცხოველები":{icon:"🐾"},"სხეულის ნაწილები":{icon:"🫀"},
  "ტანსაცმელი":{icon:"👗"},"ტრანსპორტი":{icon:"🚗"},"ემოციები":{icon:"😊"},
  "ბუნება":{icon:"🌿"},"ამინდი":{icon:"🌤️"},"სამსახური":{icon:"💼"},
  "ტექნოლოგია":{icon:"💻"},"ადგილები":{icon:"📍"},"განათლება":{icon:"🎓"},
  "ჯანმრთელობა":{icon:"🏥"},"ქვეყნები":{icon:"🌍"},"შოპინგი":{icon:"🛍️"},
  "დრო":{icon:"⏰"},"B1 ლექსიკა":{icon:"📗"},"B2 ლექსიკა":{icon:"📘"},"C1/C2 ლექსიკა":{icon:"📙"},
};

function buildCategories(){
  const cats={};
  VOCABULARY.forEach(w=>{ if(!cats[w.cat]) cats[w.cat]=[]; cats[w.cat].push(w); });
  const el=document.getElementById("cat-list");
  el.innerHTML="";
  for(const [cat,words] of Object.entries(cats)){
    const meta=CATEGORIES_META[cat]||{icon:"📂"};
    const learned=words.filter(w=>state.learnedWords.includes(w.de)).length;
    const div=document.createElement("div");
    div.className="cat-group"; div.dataset.cat=cat.toLowerCase();
    div.innerHTML=`
      <div class="cat-group-header" onclick="toggleCat(this)">
        <div class="cat-group-title"><span class="icon">${meta.icon}</span>${cat}</div>
        <span class="cat-arrow">▶</span>
      </div>
      <div class="cat-items">
        <div class="cat-item" onclick="filterByCategory('${cat.replace(/'/g,"\\'")}')">
          <span>ყველა სიტყვა</span>
          <span class="cat-item-level">${learned}/${words.length}</span>
        </div>
        ${[...new Set(words.map(w=>w.level))].map(lv=>`
          <div class="cat-item" onclick="filterByCategoryLevel('${cat.replace(/'/g,"\\'")}','${lv}')">
            <span>${lv}</span>
            <span class="cat-item-level">${words.filter(w=>w.level===lv).length}</span>
          </div>`).join("")}
      </div>`;
    el.appendChild(div);
  }
}

function toggleCat(h){ h.parentElement.classList.toggle("open"); }
function filterCategories(val){
  document.querySelectorAll(".cat-group").forEach(g=>{
    g.style.display=g.dataset.cat.includes(val.toLowerCase())?"":"none";
  });
}
function filterByCategory(cat){ state.vocabFilter=cat; state.currentVocabPage=1; navigate("vocab"); setTimeout(renderVocab,100); }
function filterByCategoryLevel(cat,level){ state.vocabFilter=level; state.currentVocabPage=1; navigate("vocab"); setTimeout(renderVocab,100); }

// ────────────────────────────────────────────
// VOCABULARY — PAGINATION 20/page
// ────────────────────────────────────────────
const VOCAB_LEVELS=["all","A1","A2","B1","B2","C1","C2"];
const PAGE_SIZE=20;

function renderVocab(){
  const filters=document.getElementById("vocab-filters");
  if(filters&&!filters.children.length){
    filters.innerHTML=VOCAB_LEVELS.map(l=>`<button class="vfb-btn ${l==="all"?"active":""}" data-filter="${l}" onclick="setVocabFilter('${l}')">${l==="all"?"ყველა":l}</button>`).join("")
      +`<button class="vfb-btn" data-filter="fav" onclick="setVocabFilter('fav')">❤️ ფავ.</button>`
      +`<button class="vfb-btn" data-filter="learned" onclick="setVocabFilter('learned')">✅ ნასწავლი</button>`
      +`<button class="vfb-btn" data-filter="review" onclick="setVocabFilter('review')">🔄 გასამეო.</button>`;
  }
  document.querySelectorAll("#vocab-filters .vfb-btn").forEach(b=>b.classList.toggle("active",b.dataset.filter===state.vocabFilter));
  const q=(document.getElementById("vocab-search")?.value||"").toLowerCase();
  let words=VOCABULARY.filter(w=>{
    if(state.vocabFilter==="fav") return state.favoriteWords.includes(w.de);
    if(state.vocabFilter==="learned") return state.learnedWords.includes(w.de);
    if(state.vocabFilter==="review") return isDue(w.de);
    if(state.vocabFilter!=="all"&&!VOCAB_LEVELS.slice(1).includes(state.vocabFilter)) return w.cat===state.vocabFilter;
    return state.vocabFilter==="all"||w.level===state.vocabFilter;
  }).filter(w=>!q||w.de.toLowerCase().includes(q)||w.ka.toLowerCase().includes(q));

  const total=words.length;
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(state.currentVocabPage>totalPages) state.currentVocabPage=1;
  const start=(state.currentVocabPage-1)*PAGE_SIZE;
  const pageWords=words.slice(start,start+PAGE_SIZE);

  const grid=document.getElementById("vocab-grid");
  grid.innerHTML=pageWords.map(w=>{
    const isLearned=state.learnedWords.includes(w.de);
    const isDueNow=isDue(w.de);
    const isPriority=state.priorityWords.includes(w.de);
    let badge="";
    if(isLearned) badge=`<span class="vocab-status-badge learned">✅</span>`;
    else if(isDueNow || isPriority) badge=`<span class="vocab-status-badge review">🔄</span>`;
    const deText=normalizeWordDisplay(w);
    return `<div class="vocab-card ${isLearned?"learned-word":(isDueNow||isPriority)?"srs-due":""}">
      ${badge}
      <div class="vocab-de">${deText}</div>
      <div class="vocab-phonetic">${w.phonetic}</div>
      <div class="vocab-ka">${w.ka}</div>
      ${w.example?`<div style="font-size:0.72rem;color:var(--text3);margin-top:4px;font-style:italic;">${w.example}</div>`:""}
      <span class="vocab-fav ${state.favoriteWords.includes(w.de)?"active":""}" onclick="toggleFav(event,'${w.de.replace(/'/g,"\\'")}')">❤️</span>
      <button class="vocab-audio-btn" onclick="event.stopPropagation();speak('${deText.replace(/'/g,"\\'")}')">🔊</button>
    </div>`;
  }).join("")||`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3);">სიტყვა ვერ მოიძებნა</div>`;

  renderPagination(totalPages);
  const ci=document.getElementById("vocab-count-info");
  if(ci) ci.textContent=`${total} სიტყვა${q?" (ძებნა)":""}`;
}

function renderPagination(totalPages){
  const el=document.getElementById("vocab-pagination");
  if(!el) return;
  if(totalPages<=1){ el.innerHTML=""; return; }
  const cur=state.currentVocabPage;
  let btns=`<button class="page-btn" onclick="setVocabPage(${cur-1})" ${cur===1?"disabled":""}>‹</button>`;
  for(let i=1;i<=totalPages;i++){
    if(i===1||i===totalPages||(i>=cur-2&&i<=cur+2))
      btns+=`<button class="page-btn ${i===cur?"active":""}" onclick="setVocabPage(${i})">${i}</button>`;
    else if(i===cur-3||i===cur+3) btns+=`<span style="padding:0 4px;color:var(--text3)">…</span>`;
  }
  btns+=`<button class="page-btn" onclick="setVocabPage(${cur+1})" ${cur===totalPages?"disabled":""}>›</button>`;
  el.innerHTML=btns;
}
function setVocabPage(p){ if(p<1) return; state.currentVocabPage=p; renderVocab(); document.getElementById("page-vocab")?.scrollTo(0,0); }
function setVocabFilter(f){ state.vocabFilter=f; state.currentVocabPage=1; saveState(); renderVocab(); }
function toggleFav(e,de){
  e.stopPropagation();
  const i=state.favoriteWords.indexOf(de);
  if(i>-1) state.favoriteWords.splice(i,1);
  else{ state.favoriteWords.push(de); addXP(2,false); }
  saveState(); checkAchievements(); renderVocab();
}

// ────────────────────────────────────────────
// STRUCTURED LEARNING SESSION
// ────────────────────────────────────────────
let learnWords=[], learnIdx=0, learnSessionAwarded=false;

function startLearningSession(){
  learnSessionAwarded=false;
  learnWords = buildStudyPool(()=>true).slice(0, 20);
  if(!learnWords.length){
    navigate("learn");
    const allDone = VOCABULARY.length>0 && !getReviewWords(()=>true).length;
    document.getElementById("learn-session-area").innerHTML = allDone
      ?`<div class="learn-complete-card"><div class="learn-complete-emoji">🎓</div><div class="learn-complete-title">ყველა სიტყვა ნასწავლია!</div><button class="primary-btn" style="margin-top:16px;" onclick="navigate('quiz')">კვიზი →</button></div>`
      :`<div class="learn-complete-card"><div class="learn-complete-emoji">✨</div><div class="learn-complete-title">გამეორება საჭირო არ არის!</div><p style="color:var(--text2);margin-top:8px;">ყველა სიტყვა განმეორებულია. დაბრუნდი ხვალ.</p><button class="primary-btn" style="margin-top:16px;" onclick="navigate('vocab')">ლექსიკონი →</button></div>`;
    return;
  }
  learnIdx=0;
  navigate("learn");
  renderLearnWord();
}

function renderLearnWord(){
  const area=document.getElementById("learn-session-area");
  if(!area) return;
  if(learnIdx>=learnWords.length){
    area.innerHTML=`<div class="learn-complete-card">
      <div class="learn-complete-emoji">🎉</div>
      <div class="learn-complete-title">სესია დასრულდა!</div>
      <p style="color:var(--text2);margin-top:8px;">გაიარეთ ${learnWords.length} სიტყვა!</p>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
        <button class="primary-btn" onclick="startLearningSession()">🔁 ახალი სესია</button>
        <button class="learn-nav-btn prev" onclick="navigate('quiz')">🎮 კვიზი</button>
      </div></div>`;
    if(!learnSessionAwarded){
      learnSessionAwarded = true;
      addXP(10);
      checkAchievements();
      renderWeeklyChart();
    }
    return;
  }
  const w=learnWords[learnIdx];
  const isLearned=state.learnedWords.includes(w.de);
  const srs=getSRSData(w.de);
  const deText=normalizeWordDisplay(w);
  area.innerHTML=`
    <div class="learn-session-card">
      <div class="learn-progress-info">
        <span class="learn-progress-text">${learnIdx+1} / ${learnWords.length}</span>
        <span class="learn-mark-btn ${isLearned?"learned":"not-learned"}">${isLearned?"✅ ნასწავლი":"⬜ ჯერ არ ისწავლია"}</span>
      </div>
      <div class="fc-category">${w.cat} · <span class="badge-${w.level.toLowerCase()}">${w.level}</span></div>
      <div class="learn-word-de">${deText}</div>
      <div class="learn-word-phonetic">${w.phonetic}</div>
      <div class="learn-word-ka">${w.ka}</div>
      ${w.example?`<div class="learn-word-example">"${w.example}"</div>`:""}
      <button class="learn-audio-btn" onclick="speak('${deText.replace(/'/g,"\\'")}')">🔊 მოუსმინე</button>
      <div style="font-size:0.75rem;color:var(--text3);margin-bottom:10px;">📊 SRS: ${srs.reps} გამ. · ინტ. ${srs.interval||0}დ.</div>
      <div style="font-size:0.78rem;color:var(--text2);margin-bottom:10px;">ამ სიტყვის სირთულე:</div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="fc-btn hard" style="flex:1;" onclick="learnRate(0)">😓 რთული</button>
        <button class="fc-btn ok" style="flex:1;" onclick="learnRate(1)">😐 ასე-ისე</button>
        <button class="fc-btn easy" style="flex:1;" onclick="learnRate(2)">😊 ადვილი</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="learn-nav-btn prev" onclick="learnGoBack()" ${learnIdx===0?"disabled":""}>← წინა</button>
        <button class="learn-nav-btn next" onclick="learnSkip()">გამოტოვება →</button>
      </div>
    </div>`;
}
function learnRate(r){
  if(learnIdx>=learnWords.length) return;
  const xpM=[2,5,10];
  const current=learnWords[learnIdx];
  addXP(xpM[r],false);
  updateSRS(current.de,r);
  if(r===0){
    learnWords.splice(learnIdx+1,0,current);
    learnIdx++;
  } else {
    learnIdx++;
  }
  renderLearnWord();
}
function learnGoBack(){ if(learnIdx>0){ learnIdx--; renderLearnWord(); } }
function learnSkip(){ learnIdx++; renderLearnWord(); }

// ────────────────────────────────────────────
// GRAMMAR
// ────────────────────────────────────────────
const GRAMMAR_RULES=[
  {title:"არტიკლები: der, die, das",icon:"📌",level:"A1",body:`<p style="font-size:0.85rem;color:var(--text2);margin:12px 0;line-height:1.7;">გერმანულ ენაში სამი განსაზღვრული არტიკლია: <strong>der</strong> (მამრ.), <strong>die</strong> (მდედ./მრ.რ.), <strong>das</strong> (საშ.).</p><table class="grammar-table"><tr><th>სქესი</th><th>განსაზ.</th><th>განუსაზ.</th><th>მაგ.</th></tr><tr><td>მამრობითი</td><td>der</td><td>ein</td><td>der Mann</td></tr><tr><td>მდედრობითი</td><td>die</td><td>eine</td><td>die Frau</td></tr><tr><td>საშ.</td><td>das</td><td>ein</td><td>das Kind</td></tr><tr><td>მრ. რ.</td><td>die</td><td>—</td><td>die Männer</td></tr></table><div class="grammar-note">💡 -ung, -heit, -keit, -schaft → ყოველთვის die.</div>`},
  {title:"Kasus: ბრუნვები",icon:"🔄",level:"A2",body:`<table class="grammar-table"><tr><th>ბრუნვა</th><th>der(m)</th><th>die(f)</th><th>das(n)</th><th>die(pl)</th></tr><tr><td>Nominativ</td><td>der</td><td>die</td><td>das</td><td>die</td></tr><tr><td>Akkusativ</td><td>den</td><td>die</td><td>das</td><td>die</td></tr><tr><td>Dativ</td><td>dem</td><td>der</td><td>dem</td><td>den</td></tr><tr><td>Genitiv</td><td>des</td><td>der</td><td>des</td><td>der</td></tr></table><div class="grammar-example"><div class="de">Der Mann sieht den Hund.</div><div class="ka">კაცი ხედავს ძაღლს. (Mann=Nom, Hund=Akk)</div></div>`},
  {title:"Präsens: sein და haben",icon:"⏱️",level:"A1",body:`<table class="grammar-table"><tr><th>პირი</th><th>sein</th><th>haben</th></tr><tr><td>ich</td><td>bin</td><td>habe</td></tr><tr><td>du</td><td>bist</td><td>hast</td></tr><tr><td>er/sie/es</td><td>ist</td><td>hat</td></tr><tr><td>wir</td><td>sind</td><td>haben</td></tr><tr><td>ihr</td><td>seid</td><td>habt</td></tr><tr><td>sie/Sie</td><td>sind</td><td>haben</td></tr></table>`},
  {title:"Satzstellung: V2 წესი",icon:"📐",level:"A2",body:`<table class="grammar-table"><tr><th>პოზ.1</th><th>ზმნა</th><th>სუბ.</th><th>დანარ.</th></tr><tr><td>Ich</td><td>gehe</td><td>—</td><td>heute nach Hause.</td></tr><tr><td>Heute</td><td>gehe</td><td>ich</td><td>nach Hause.</td></tr></table><div class="grammar-note">💡 ქვე-წინადადებებში ზმნა ბოლოს: "Ich weiß, dass er <strong>kommt</strong>."</div>`},
  {title:"Modalverben: მოდალური ზმნები",icon:"🎯",level:"A2",body:`<table class="grammar-table"><tr><th>ზმნა</th><th>მნიშვ.</th><th>ich</th><th>du</th><th>er/sie</th></tr><tr><td>können</td><td>შეძლება</td><td>kann</td><td>kannst</td><td>kann</td></tr><tr><td>müssen</td><td>სავალდ.</td><td>muss</td><td>musst</td><td>muss</td></tr><tr><td>wollen</td><td>სურვილი</td><td>will</td><td>willst</td><td>will</td></tr><tr><td>dürfen</td><td>ნებართვა</td><td>darf</td><td>darfst</td><td>darf</td></tr><tr><td>mögen</td><td>მოწონება</td><td>mag</td><td>magst</td><td>mag</td></tr></table>`},
  {title:"Perfekt: ნამდვილი წარსული",icon:"⌛",level:"A2",body:`<table class="grammar-table"><tr><th>ინფ.</th><th>Partizip II</th><th>დამხ.</th><th>მაგ.</th></tr><tr><td>machen</td><td>gemacht</td><td>haben</td><td>Ich habe gemacht.</td></tr><tr><td>gehen</td><td>gegangen</td><td>sein</td><td>Ich bin gegangen.</td></tr><tr><td>essen</td><td>gegessen</td><td>haben</td><td>Er hat gegessen.</td></tr></table><div class="grammar-note">💡 sein-ით: გადაადგილ. ზმნები (gehen, fahren, kommen...)</div>`},
  {title:"Konjunktiv II: ირეალური პირობა",icon:"🌀",level:"B1",body:`<table class="grammar-table"><tr><th>პირი</th><th>würde+Inf.</th><th>wäre</th><th>hätte</th></tr><tr><td>ich</td><td>würde gehen</td><td>wäre</td><td>hätte</td></tr><tr><td>du</td><td>würdest gehen</td><td>wärst</td><td>hättest</td></tr></table><div class="grammar-example"><div class="de">Wenn ich Zeit hätte, würde ich lernen.</div><div class="ka">რომ დრო მქონდეს, ვისწავლიდი.</div></div>`},
  {title:"Adjektivdeklination: ზედსართ. ბრუნება",icon:"🎭",level:"B1",body:`<table class="grammar-table"><tr><th></th><th>მამრ.(Nom)</th><th>მდედ.(Nom)</th><th>საშ.(Nom)</th></tr><tr><td>განსაზ.</td><td>der alte Mann</td><td>die alte Frau</td><td>das alte Kind</td></tr><tr><td>განუსაზ.</td><td>ein alter Mann</td><td>eine alte Frau</td><td>ein altes Kind</td></tr></table>`},
  {title:"Passiv: პასიური გვარი",icon:"🔁",level:"B2",body:`<table class="grammar-table"><tr><th>დრო</th><th>ფორმა</th><th>მაგ.</th></tr><tr><td>Präsens</td><td>wird+P.II</td><td>Das Buch wird gelesen.</td></tr><tr><td>Perfekt</td><td>wurde+P.II</td><td>Das Buch wurde gelesen.</td></tr></table>`},
  {title:"Komposita: სიტყვათა შეკვრა",icon:"🔧",level:"B2",body:`<div class="grammar-example"><div class="de">Krankenhaus = krank + Haus</div><div class="ka">საავადმყოფო</div></div><div class="grammar-example"><div class="de">Bahnhof = Bahn + Hof</div><div class="ka">სადგური</div></div><div class="grammar-note">💡 კომპოზიტის სქესი = ბოლო კომპონენტის სქესი.</div>`},
];

function renderGrammar(){
  const el=document.getElementById("grammar-list");
  if(!el) return;
  el.innerHTML=GRAMMAR_RULES.map((r,i)=>`
    <div class="grammar-rule" id="gr-${i}">
      <div class="grammar-rule-header" onclick="toggleGrammar(${i})">
        <div class="grammar-rule-title"><span>${r.icon}</span>${r.title}<span class="lesson-badge badge-${r.level.toLowerCase()}">${r.level}</span></div>
        <span class="grammar-arrow">▼</span>
      </div>
      <div class="grammar-rule-body">${r.body}</div>
    </div>`).join("");
}
function toggleGrammar(i){
  const el=document.getElementById("gr-"+i);
  const wasOpen=el.classList.contains("open");
  el.classList.toggle("open");
  if(!wasOpen){ addXP(3,false); state.grammarViewed=(state.grammarViewed||0)+1; saveState(); checkAchievements(); }
}

// ────────────────────────────────────────────
// FLASHCARDS — SRS-DRIVEN
// ────────────────────────────────────────────
let flashWords=[], flashIdx=0, isFlipped=false, flashPoolSignature="";

function getFlashPool(){
  const cat=state.flashCategory||"all";
  const f=w=>cat==="all" ? true : (VOCAB_LEVELS.slice(1).includes(cat)?w.level===cat:w.cat===cat);
  return buildStudyPool(f, 8);
}

function renderFlashcard(){
  const filterEl=document.getElementById("flash-filters");
  if(filterEl&&!filterEl.children.length){
    filterEl.innerHTML=[["all","ყველა"],...VOCAB_LEVELS.slice(1).map(l=>[l,l])].map(([v,l])=>
      `<button class="vfb-btn ${v==="all"?"active":""}" data-ff="${v}" onclick="setFlashFilter('${v}')">${l}</button>`).join("");
  }
  const reviewCount=getReviewWords().length;
  const di=document.getElementById("flash-due-info");
  if(di) di.textContent=reviewCount>0?`🔄 ${reviewCount} სიტყვა გასამეორებელია`:"✨ ყველა განმეორებულია!";

  const signature=state.flashCategory||"all";
  if(!flashWords.length || flashPoolSignature!==signature){
    flashWords=getFlashPool();
    flashIdx=0;
    flashPoolSignature=signature;
  }
  if(!flashWords.length){
    document.getElementById("flashcard-area").innerHTML=`<div style="text-align:center;padding:40px;color:var(--text2);">
      <div style="font-size:3rem;margin-bottom:12px;">✨</div>
      <div style="font-size:1rem;font-weight:600;">გასამეორებელი სიტყვა არ არის!</div>
      <button class="primary-btn" style="margin-top:16px;" onclick="startLearningSession()">🚀 სწავლის დაწყება</button></div>`;
    return;
  }
  if(flashIdx>=flashWords.length) flashIdx=0;
  isFlipped=false;
  const w=flashWords[flashIdx];
  const srs=getSRSData(w.de);
  const pct=flashWords.length?(flashIdx/flashWords.length)*100:0;
  const deText=normalizeWordDisplay(w);
  document.getElementById("flashcard-area").innerHTML=`
    <div class="flashcard-progress-bar"><div class="flashcard-progress-fill" style="width:${pct}%"></div></div>
    <div class="fc-counter">${flashIdx+1}/${flashWords.length} ${isDue(w.de)?'<span class="srs-due-badge">DUE</span>':''}</div>
    <div class="flashcard-scene" id="fc-scene" onclick="flipCard()">
      <div class="flashcard-inner">
        <div class="flashcard-face flashcard-front">
          <div class="fc-category">${w.cat}</div>
          <div class="fc-de">${deText}</div>
          <div class="fc-phonetic">${w.phonetic}</div>
          <div class="fc-hint">შეეხეთ / Space — გადატრიალება</div>
        </div>
        <div class="flashcard-face flashcard-back">
          <div class="fc-category">${w.level}</div>
          <div class="fc-ka">${w.ka}</div>
          <div class="fc-phonetic">${w.phonetic}</div>
          ${w.example?`<div class="fc-example">"${w.example}"</div>`:""}
          <button class="learn-audio-btn" style="margin-top:12px;" onclick="event.stopPropagation();speak('${deText.replace(/'/g,"\\'")}')">🔊</button>
        </div>
      </div>
    </div>
    <div class="flashcard-actions">
      <button class="fc-btn hard" onclick="nextFlash('hard')">😓 რთული<br><small>← ან 1</small></button>
      <button class="fc-btn ok" onclick="nextFlash('ok')">😐 ასე-ისე<br><small>↑ ან 2</small></button>
      <button class="fc-btn easy" onclick="nextFlash('easy')">😊 ადვილი<br><small>→ ან 3</small></button>
    </div>
    <div class="fc-keyboard-hint">⌨️ Space=გადატრ. · 1=რთ. · 2=ასე · 3=ადვ.</div>
    <div style="font-size:0.68rem;color:var(--text3);text-align:center;margin-top:4px;">SRS: ${srs.reps} გამ. · ${srs.interval||0}დ. ინტ.</div>`;
}
function flipCard(){ document.getElementById("fc-scene")?.classList.toggle("flipped"); isFlipped=!isFlipped; }
function nextFlash(rating){
  const rMap={hard:0,ok:1,easy:2}, xpMap={hard:2,ok:5,easy:10};
  const current=flashWords[flashIdx];
  addXP(xpMap[rating],false);
  updateSRS(current.de,rMap[rating]);
  if(rating==="hard"){
    flashWords.splice(flashIdx+1,0,current);
    flashIdx = Math.min(flashIdx+1, flashWords.length-1);
  } else {
    flashWords=[];
    flashPoolSignature="";
    flashIdx=0;
  }
  isFlipped=false; renderFlashcard();
}
function setFlashFilter(v){
  state.flashCategory=v; flashIdx=0; flashWords=[]; flashPoolSignature="";
  document.querySelectorAll("[data-ff]").forEach(b=>b.classList.toggle("active",b.dataset.ff===v));
  renderFlashcard();
}

// ────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ────────────────────────────────────────────
function handleKeyboard(e){
  const pg=document.querySelector(".page.active");
  if(!pg||pg.id!=="page-flash") return;
  if(e.target.tagName==="INPUT") return;
  if(e.code==="Space"){ e.preventDefault(); flipCard(); }
  else if(e.key==="1"&&isFlipped) nextFlash("hard");
  else if(e.key==="2"&&isFlipped) nextFlash("ok");
  else if(e.key==="3"&&isFlipped) nextFlash("easy");
}

// ────────────────────────────────────────────
// QUIZ — LEARNED WORDS ONLY
// ────────────────────────────────────────────
let quizSet=[], quizIdx=0, quizScore=0, quizAnswered=false, quizSessionAwarded=false;

function renderQuiz(){
  quizSessionAwarded=false;
  const typeSel=document.getElementById("quiz-types");
  if(typeSel&&!typeSel.children.length){
    typeSel.innerHTML=[["de-ka","DE → KA"],["ka-de","KA → DE"],["article","სტატია"]].map(([v,l])=>
      `<button class="qts-btn ${v==="de-ka"?"active":""}" data-qt="${v}" onclick="setQuizType('${v}')">${l}</button>`).join("");
  }
  const pool=getLearnedVocab().filter(w=>!state.difficultWords.includes(w.de));
  if(pool.length<4){
    document.getElementById("quiz-area").innerHTML=`<div class="quiz-no-words">
      <div style="font-size:2.5rem;margin-bottom:12px;">📚</div>
      <strong>კვიზი ჯერ მიუწვდომელია</strong><br><br>
      საჭიროა მინ. <strong>4 ნასწავლი სიტყვა</strong>.<br>ახლა: <strong>${pool.length}</strong><br><br>
      <button class="primary-btn" onclick="startLearningSession()">🚀 სწავლის დაწყება</button></div>`;
    return;
  }
  quizSet=pool.sort(()=>Math.random()-0.5).slice(0,Math.min(15,pool.length));
  quizIdx=0; quizScore=0; quizAnswered=false;
  renderQuizQuestion();
}
function setQuizType(t){
  document.querySelectorAll("[data-qt]").forEach(b=>b.classList.toggle("active",b.dataset.qt===t));
  state.quizType=t; renderQuiz();
}
function renderQuizQuestion(){
  const area=document.getElementById("quiz-area");
  if(quizIdx>=quizSet.length){
    const pct=Math.round((quizScore/quizSet.length)*100);
    area.innerHTML=`<div class="quiz-card"><div class="quiz-result">
      <div class="quiz-result-emoji">${pct>=80?"🎉":pct>=50?"👍":"📚"}</div>
      <div class="quiz-result-score">${pct}%</div>
      <div class="quiz-result-msg">${quizScore}/${quizSet.length} სწორი</div>
      <button class="quiz-restart" onclick="renderQuiz()">🔁 ხელახლა</button>
    </div></div>`;
    if(!quizSessionAwarded){
      quizSessionAwarded = true;
      if(pct===100){ state.perfectQuiz=(state.perfectQuiz||0)+1; }
      state.testsCompleted++;
      addXP(quizScore*8,false);
      saveState();
      checkAchievements();
    }
    return;
  }
  const w=quizSet[quizIdx], qt=state.quizType||"de-ka";
  const pool=getLearnedVocab().filter(x=>!state.difficultWords.includes(x.de));
  const pct=(quizIdx/quizSet.length)*100;
  let question,correct,options;
  if(qt==="de-ka"){
    question=normalizeWordDisplay(w); correct=w.ka;
    options=shuffle([w.ka,...getWrongAnswers(w,"ka",pool)]);
  } else if(qt==="ka-de"){
    question=w.ka; correct=w.de;
    options=shuffle([w.de,...getWrongAnswers(w,"de",pool)]);
  } else {
    question=w.de; correct=w.article||"—";
    options=["der","die","das","—"];
  }
  area.innerHTML=`<div class="quiz-card">
    <div class="quiz-progress">
      <div class="quiz-prog-bar"><div class="quiz-prog-fill" style="width:${pct}%"></div></div>
      <div class="quiz-prog-text">${quizIdx+1}/${quizSet.length}</div>
    </div>
    <div class="quiz-question">${question}</div>
    <div class="quiz-hint">${qt==="de-ka"?"🔊 "+w.phonetic:qt==="article"?"სწორი სტატია?":"გერმანულად?"}</div>
    <div class="quiz-options">${options.map(o=>`<button class="quiz-opt" onclick="answerQuiz(this,'${o.replace(/'/g,"\\'")}','${correct.replace(/'/g,"\\'")}')"> ${o}</button>`).join("")}</div>
    <div class="quiz-feedback" id="quiz-fb"></div>
    <button class="quiz-next-btn" id="quiz-next" onclick="nextQuiz()">შემდეგი →</button>
  </div>`;
}
function getWrongAnswers(w,field,pool){
  return [...new Set(
    pool.filter(x=>x.de!==w.de && x[field] && x[field]!==w[field])
      .map(x=>x[field])
  )].sort(()=>Math.random()-0.5).slice(0,3);
}
function shuffle(a){ return a.sort(()=>Math.random()-0.5); }
function answerQuiz(btn,answer,correct){
  if(quizAnswered) return; quizAnswered=true;
  const ok=answer===correct;
  document.querySelectorAll(".quiz-opt").forEach(b=>{
    b.disabled=true;
    if(b.textContent.trim()===correct) b.classList.add("correct");
    else if(b===btn&&!ok) b.classList.add("wrong");
  });
  const fb=document.getElementById("quiz-fb");
  fb.className="quiz-feedback show "+(ok?"ok":"bad");
  fb.textContent=ok?`✅ სწორია! +8 XP`:`❌ სწორი: ${correct}`;
  if(ok) quizScore++;
  document.getElementById("quiz-next").classList.add("show");
}
function nextQuiz(){ quizIdx++; quizAnswered=false; renderQuizQuestion(); }

// ────────────────────────────────────────────
// TESTS — LEARNED WORDS ONLY
// ────────────────────────────────────────────
function renderTests(){
  const learnedPool = getLearnedVocab().filter(w=>!state.difficultWords.includes(w.de));
  const lc=learnedPool.length;
  const tests=[
    {icon:"📝",name:"A1 ტესტი",desc:"20 კითხვა.",level:"A1",min:4},
    {icon:"📋",name:"A2 ტესტი",desc:"20 კითხვა.",level:"A2",min:8},
    {icon:"📗",name:"B1 ტესტი",desc:"20 კითხვა.",level:"B1",min:10},
    {icon:"📘",name:"B2 ტესტი",desc:"20 კითხვა.",level:"B2",min:15},
    {icon:"🧩",name:"შერეული",desc:"ყველა დონე. 20 კ.",level:"all",min:4},
    {icon:"🔊",name:"სტატიების ტ.",desc:"der/die/das. 20კ.",level:"article",min:8},
    {icon:"❤️",name:"ფავ. სიტყვები",desc:"შენი ფავორიტები.",level:"fav",min:4},
  ];
  const el=document.getElementById("test-list");
  if(lc<4){
    el.innerHTML=`<div class="test-no-words" style="grid-column:1/-1;padding:40px;text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:16px;">
      <div style="font-size:2rem;margin-bottom:12px;">📚</div>
      <strong>ტესტები ჯერ მიუწვდომელია</strong><br><br>
      საჭიროა მინ. 4 ნასწავლი სიტყვა.<br>ახლა: <strong>${lc}</strong><br><br>
      <button class="primary-btn" onclick="startLearningSession()">🚀 სწავლის დაწყება</button></div>`;
    return;
  }
  el.innerHTML=tests.map(t=>{
    const pool=t.level==="fav"?learnedPool.filter(w=>state.favoriteWords.includes(w.de))
      :t.level==="all"?learnedPool
      :t.level==="article"?learnedPool.filter(w=>w.article)
      :learnedPool.filter(w=>w.level===t.level);
    const avail=pool.length, locked=avail<t.min;
    return `<div class="test-item" onclick="${locked?`showToast('საჭიროა კიდევ ${t.min-avail} სიტყვა!')`:`startTest('${t.name}','${t.level}')`}">
      <div class="test-icon">${t.icon}</div>
      <div class="test-name">${t.name}${locked?" 🔒":""}</div>
      <div class="test-desc">${t.desc}</div>
      <div class="test-meta">
        <span class="lesson-badge badge-${t.level.split("-")[0].toLowerCase()==="all"?"a1":t.level.split("-")[0].toLowerCase()}">${t.level==="all"?"A1-C2":t.level}</span>
        <span style="font-size:0.72rem;color:var(--text3);">${avail} სიტ.</span>
      </div></div>`;
  }).join("");
}
function startTest(name,level){
  const learnedPool = getLearnedVocab().filter(w=>!state.difficultWords.includes(w.de));
  const pool=level==="fav"?learnedPool.filter(w=>state.favoriteWords.includes(w.de))
    :level==="all"?learnedPool
    :level==="article"?learnedPool.filter(w=>w.article)
    :learnedPool.filter(w=>w.level===level);
  if(pool.length<4){ showToast("ამ ტესტისთვის სიტყვა არ კმარა!"); return; }
  state.quizType=level==="article"?"article":"de-ka";
  quizSet=pool.sort(()=>Math.random()-0.5).slice(0,Math.min(20,pool.length));
  quizIdx=0; quizScore=0; quizAnswered=false;
  navigate("quiz");
  document.querySelectorAll("[data-qt]").forEach(b=>b.classList.toggle("active",b.dataset.qt===state.quizType));
  showToast(`"${name}" დაიწყო! 📝`);
  renderQuizQuestion();
}

// ────────────────────────────────────────────
// PHONETICS
// ────────────────────────────────────────────
const PHONETICS_DATA=[
  {symbol:"ʀ",de:"Rot, Regen",ka:"ყელის 'ღ' ბგერა"},
  {symbol:"ü [y]",de:"fünf, über, grün",ka:"'ი' + მომრგვ. ტუჩები"},
  {symbol:"ö [ø]",de:"schön, Österreich",ka:"'ე' + მომრგვ. ტუჩები"},
  {symbol:"ä [ɛ]",de:"Männer, Mädchen",ka:"ფართო 'ე' ბგერა"},
  {symbol:"ch [ç]",de:"ich, nicht, Milch",ka:"'ი'-ს შემდ.: 'ჰ'+ი"},
  {symbol:"ch [x]",de:"Bach, nach, Buch",ka:"'ა/ო/უ'-ს შემდ.: 'ხ'"},
  {symbol:"sch [ʃ]",de:"Schule, schön",ka:"ქართული 'შ'"},
  {symbol:"sp/st [ʃp/ʃt]",de:"sprechen, Stadt",ka:"სიტ. თავში: 'შპ'/'შტ'"},
  {symbol:"z [ts]",de:"zehn, Zeit",ka:"ქართული 'ც'"},
  {symbol:"w [v]",de:"Wasser, wohnen",ka:"ქართული 'ვ'"},
  {symbol:"ei [aɪ]",de:"ein, zwei, weiß",ka:"'ეი' დიფთ."},
  {symbol:"eu/äu [ɔɪ]",de:"neu, Häuser",ka:"'ოი' დიფთ."},
  {symbol:"ie [iː]",de:"die, viel, lieben",ka:"გრძელი 'ი'"},
  {symbol:"ß [s]",de:"Straße, Fuß",ka:"გრძელი 'ს' (=ss)"},
  {symbol:"ng [ŋ]",de:"singen, lang",ka:"ინგლ. 'ng'-ს მსგ."},
  {symbol:"r [ɐ]",de:"Mutter, aber",ka:"სუსტი 'ა' (სიტ. ბოლოს)"},
];
function renderPhonetics(){
  const el=document.getElementById("phonetics-content"); if(!el) return;
  el.innerHTML=`
    <div class="section-card">
      <div class="section-card-title">🔤 გერმანული სპეციფიური ბგერები</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
        ${PHONETICS_DATA.map(p=>`
          <div class="phonetic-card">
            <div class="phonetic-symbol" style="cursor:pointer;" onclick="speak('${p.de.split(',')[0].trim()}')">${p.symbol}</div>
            <div class="phonetic-info"><div class="de">${p.de}</div><div class="ka">${p.ka}</div></div>
          </div>`).join("")}
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-title">📏 გრძელი vs მოკლე ხმოვნები</div>
      <table class="grammar-table">
        <tr><th>ხმოვ.</th><th>გრძელი</th><th>მოკლე</th></tr>
        <tr><td>a</td><td>Vater [aː]</td><td>Mann [a]</td></tr>
        <tr><td>e</td><td>Weg [eː]</td><td>Bett [ɛ]</td></tr>
        <tr><td>i</td><td>ihm [iː]</td><td>bin [ɪ]</td></tr>
        <tr><td>o</td><td>Ohr [oː]</td><td>Gott [ɔ]</td></tr>
        <tr><td>u</td><td>gut [uː]</td><td>und [ʊ]</td></tr>
      </table>
    </div>`;
}

// ────────────────────────────────────────────
// QUICK LESSONS
// ────────────────────────────────────────────
const LESSONS_DATA=[
  {num:1,title:"გამარჯობა",meta:"A1·10 სიტ.",level:"A1",cat:"მისალმება"},
  {num:2,title:"ოჯახი",meta:"A1·12 სიტ.",level:"A1",cat:"ოჯახი"},
  {num:3,title:"სახლი",meta:"A1·11 სიტ.",level:"A1",cat:"სახლი"},
  {num:4,title:"საჭმელ-სასმელი",meta:"A1·20 სიტ.",level:"A1",cat:"საჭმელ-სასმელი"},
  {num:5,title:"ფერები",meta:"A1·11 სიტ.",level:"A1",cat:"ფერები"},
  {num:6,title:"ტრანსპორტი",meta:"A2·8 სიტ.",level:"A2",cat:"ტრანსპორტი"},
];
function renderQuickLessons(){
  const el=document.getElementById("quick-lessons"); if(!el) return;
  el.innerHTML=LESSONS_DATA.map(l=>{
    const cw=VOCABULARY.filter(w=>w.cat===l.cat);
    const ld=cw.filter(w=>state.learnedWords.includes(w.de)).length;
    const done=cw.length>0&&ld===cw.length;
    return `<div class="lesson-item" onclick="startLesson('${l.cat}')">
      <div class="lesson-num ${done?"done":""}">${done?"✓":l.num}</div>
      <div class="lesson-info">
        <div class="lesson-title">${l.title}</div>
        <div class="lesson-meta">${l.meta} · ${ld}/${cw.length} ნასწ.</div>
      </div>
      <span class="lesson-badge badge-${l.level.toLowerCase()}">${l.level}</span>
    </div>`;
  }).join("");
}
function startLesson(cat){
  const cw=VOCABULARY.filter(w=>w.cat===cat);
  learnWords=buildStudyPool(w=>w.cat===cat).slice(0, 6);
  if(!learnWords.length) learnWords=cw;
  learnIdx=0;
  navigate("learn"); renderLearnWord();
  showToast(`"${cat}" გაკვეთილი დაიწყო! 🚀`);
}

// ────────────────────────────────────────────
// ACHIEVEMENTS PAGE
// ────────────────────────────────────────────
function renderAchievements(){
  const el=document.getElementById("achievements-grid");
  if(!el||!ACHIEVEMENTS_DEF.length) return;
  el.innerHTML=ACHIEVEMENTS_DEF.map(a=>{
    const u=state.unlockedAchievements.includes(a.id);
    return `<div class="achievement-card ${u?"unlocked":"locked"}">
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-name">${a.name}</div>
      <div class="achievement-desc">${a.desc}</div>
      ${a.xp>0?`<div class="achievement-xp">+${a.xp} XP</div>`:""}
      ${u?`<div style="font-size:0.7rem;color:var(--success);margin-top:4px;">✅ განბლოკილია</div>`:""}
    </div>`;
  }).join("");
}

// ────────────────────────────────────────────
// SETTINGS
// ────────────────────────────────────────────
const THEMES=[
  {id:"default",name:"ლურჯი",color:"#2563eb"},{id:"dark",name:"ბნელი",color:"#334155"},
  {id:"forest",name:"მწვანე",color:"#16a34a"},{id:"amber",name:"ქარვა",color:"#d97706"},
  {id:"rose",name:"ვარდ.",color:"#e11d48"},
];
function buildSettings(){
  const g=document.getElementById("theme-grid"); if(!g) return;
  g.innerHTML=THEMES.map(t=>`
    <div class="theme-opt ${t.id===state.theme?"active":""}" onclick="setTheme('${t.id}')" data-tid="${t.id}">
      <div class="swatch" style="background:${t.color};"></div>
      <div class="name">${t.name}</div>
    </div>`).join("");
}
function setTheme(t){ state.theme=t; saveState(); applyTheme(t); document.querySelectorAll("[data-tid]").forEach(e=>e.classList.toggle("active",e.dataset.tid===t)); showToast("თემა შეიცვალა!"); }
function applyTheme(t){ document.documentElement.setAttribute("data-theme",t); }
function saveName(){ const v=document.getElementById("name-setting").value.trim(); if(!v) return; state.name=v; saveState(); updateUI(); showToast("სახელი შენახულია! ✅"); }
function clearStorage(){ if(!confirm("ნამდვილად გსურთ ყველა მონაცემის წაშლა?")) return; localStorage.clear(); location.reload(); }
function exportData(){
  const d=JSON.stringify({...state,exportDate:new Date().toISOString()},null,2);
  const b=new Blob([d],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="deutschgeo-progress.json"; a.click();
  showToast("ექსპორტი დასრულდა! 📤");
}
function importData(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept=".json";
  inp.onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{ try{ const d=JSON.parse(ev.target.result); if(!d.name){ showToast("❌ არასწორი ფაილი!"); return; } if(!confirm(`"${d.name}"-ის მონაცემები შემოიტანოთ?`)) return; state={...state,...d}; saveState(); location.reload(); }catch(e){ showToast("❌ შეცდომა!"); } };
    r.readAsText(f);
  };
  inp.click();
}

// ────────────────────────────────────────────
// MOBILE SIDEBARS & TOAST
// ────────────────────────────────────────────
function toggleLeft(){
  document.getElementById("left-sidebar").classList.toggle("open");
  document.getElementById("right-sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.toggle("show",document.getElementById("left-sidebar").classList.contains("open"));
}
function toggleRight(){
  document.getElementById("right-sidebar").classList.toggle("open");
  document.getElementById("left-sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.toggle("show",document.getElementById("right-sidebar").classList.contains("open"));
}
function closeAllSidebars(){
  ["left-sidebar","right-sidebar"].forEach(id=>document.getElementById(id).classList.remove("open"));
  document.getElementById("sidebar-overlay").classList.remove("show");
}
let _toastTimer;
function showToast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>t.classList.remove("show"),2500);
}
