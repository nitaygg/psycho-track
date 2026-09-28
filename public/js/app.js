import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, arrayUnion, arrayRemove, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// שואבים נתונים מהקבצים האחרים שבנינו!
import { rCauses, simKeys, chpNames } from './data.js';
import { calculateRealPsychoScore } from './calculator.js';

const firebaseConfig = {
    apiKey: "AIzaSyBVzxW9WPXfwIaLqdJHh7pU6Q8FydI20mY",
    authDomain: "psychotrack-c0155.firebaseapp.com",
    projectId: "psychotrack-c0155",
    storageBucket: "psychotrack-c0155.firebasestorage.app",
    messagingSenderId: "341071559164",
    appId: "1:341071559164:web:1b78de82858bd51b671a79",
    measurementId: "G-RVPQ2DJ8Z8"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.currentUser = null; 
let uData = {}, isLogin = true, aPhase = 'IN', cSim = null, aTab = 'q1', simD = {};
let errChart, radChart, uSims = [], chatUnsub = null, activeChat = null, userUnsub = null;

const showL = ()=>document.getElementById('loader').style.display='flex';
const hideL = ()=>document.getElementById('loader').style.display='none';
const scrollT = ()=>{ window.scrollTo({top:0, behavior:'smooth'}); document.documentElement.scrollTop=0; document.body.scrollTop=0; };

const playBeep = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880; 
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
};

const getGreeting = (name) => {
    const h = new Date().getHours();
    let g = h>=5&&h<12 ? 'בוקר טוב' : h>=12&&h<18 ? 'צהריים טובים' : 'ערב טוב';
    return `${g}, ${name}!`;
};

const updateCountdown = () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), 11, 4); 
    if(now > target) target.setFullYear(target.getFullYear() + 1);
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    document.getElementById('days-left').innerText = diffDays;
    
    const quotes = ["הצלחה היא סך כל המאמצים הקטנים שנעשים יום אחר יום.", "אין קיצורי דרך למקומות ששווה להגיע אליהם.", "קשה באימונים, קל בקרב.", "הדרך היחידה לעשות עבודה נהדרת היא לאהוב את מה שאתה עושה.", "הדבר היחיד שעומד בינך לבין המטרה שלך הוא הסיפור שאתה מספר לעצמך למה אתה לא יכול."];
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    document.getElementById('motivational-quote').innerText = `"${quotes[dayOfYear % quotes.length]}"`;
};

window.onload = async () => {
    let th = localStorage.getItem('pTheme')||'blue', fs = localStorage.getItem('pFont')||'16';
    document.documentElement.setAttribute('data-theme', th);
    document.documentElement.style.setProperty('--base-size', fs+'px');
    
    const sv = localStorage.getItem('psychoUser');
    if(sv) { window.currentUser = sv; await setupLiveUser(); window.navigate('dashboard'); } if(mathInterval) window.endMathGame(); // עצירת משחק פעיל בעת נטישת העמוד
    else document.getElementById('auth-page').classList.remove('hidden');
};

async function setupLiveUser() {
    if(userUnsub) userUnsub();
    userUnsub = onSnapshot(doc(db,"users",window.currentUser), (s) => {
        if(s.exists()){
            uData = s.data(); 
            if(!uData.friends) uData.friends=[]; 
            if(!uData.reqs) uData.reqs=[];
            
            document.getElementById('priv-toggle').checked = uData.isPrivate||false;
            document.getElementById('theme-sel').value = localStorage.getItem('pTheme')||'blue';
            document.getElementById('font-sel').value = localStorage.getItem('pFont')||'16';
            
            if(uData.fullName) document.getElementById('prof-fullname').value = uData.fullName;
            if(uData.bio) document.getElementById('prof-bio').value = uData.bio;
            
            let dName = uData.fullName || window.currentUser;
            document.getElementById('welcome-msg').innerText = getGreeting(dName);
            document.getElementById('dash-bio').innerText = uData.bio || '';

            checkRequestsUI();
            if(!document.getElementById('friends-page').classList.contains('hidden')){ loadFriends(); }
        }
    });
}

window.toggleAuthMode = ()=> { isLogin=!isLogin; document.getElementById('auth-title').innerText=isLogin?'התחברות למערכת':'הרשמה למערכת'; document.getElementById('auth-btn').innerText=isLogin?'התחבר':'צור חשבון'; document.getElementById('auth-toggle-btn').innerText=isLogin?'אין חשבון? הירשם עכשיו':'יש חשבון? התחבר'; }
window.handleGoogleAuth = async ()=>{ showL(); try{ let r=await signInWithPopup(auth,new GoogleAuthProvider()); let u=r.user.email.split('@')[0]; let d=await getDoc(doc(db,"users",u)); if(!d.exists()) await setDoc(doc(db,"users",u),{email:r.user.email, isGoogle:true, created:Date.now(), friends:[], reqs:[], isPrivate:false, fullName: r.user.displayName}); finLogin(u); }catch(e){ alert("שגיאה בהתחברות לגוגל."); console.error(e); } hideL(); };
window.handleAuth = async ()=>{ let u=document.getElementById('username').value.trim(), p=document.getElementById('password').value.trim(); if(!u||!p) return; showL(); try{ let d=await getDoc(doc(db,"users",u)); if(isLogin){ if(!d.exists()) { alert("שם משתמש לא קיים. עברו למצב הרשמה."); } else { let dbPass = d.data()?.password || d.data()?.pw; if(dbPass !== p) alert("סיסמה שגויה!"); else finLogin(u); } } else { if(d.exists()) alert("שם משתמש תפוס, אנא בחר שם אחר."); else{ await setDoc(doc(db,"users",u),{password:p, friends:[], reqs:[], isPrivate:false, fullName:u}); finLogin(u); } } } catch(e){ alert("שגיאת תקשורת."); } hideL(); };
async function finLogin(u){ localStorage.setItem('psychoUser',u); window.currentUser=u; await setupLiveUser(); window.navigate('dashboard'); }
window.logout = ()=>{ window.currentUser=null; localStorage.removeItem('psychoUser'); if(userUnsub)userUnsub(); if(chatUnsub)chatUnsub(); window.navigate('auth'); };

window.navigate = async (p)=>{
    if(!window.currentUser && p!=='auth') p='auth';
    ['auth-page','dashboard-page','select-sim-page','flow-container','phase-summary','history-page','arena-page','friends-page','settings-page','timer-page','diary-page'].forEach(x=>document.getElementById(x).classList.add('hidden'));
    if(p==='flow') document.getElementById('flow-container').classList.remove('hidden'); else document.getElementById(p+'-page').classList.remove('hidden');
    document.getElementById('navbar').style.display = window.currentUser ? 'block' : 'none';
    setTimeout(()=>scrollT(), 50);
    if(p==='dashboard') { updateCountdown(); await loadDash(); }
    else if(p==='history') await loadDash();
    else if(p==='diary') await loadDiary();
    else if(p==='arena') await loadArena();
    else if(p==='friends') loadFriends();
};

async function loadDash(){
    showL();
    try {
        let qs = await getDocs(query(collection(db,"simulations"), where("username","==",window.currentUser)));
        uSims = []; qs.forEach(d=> {let k=d.data(); k.id=d.id; uSims.push(k);}); uSims.sort((a,b)=>a.timestamp-b.timestamp);
        
        if(!uSims.length){ document.getElementById('empty-dashboard').classList.remove('hidden'); document.getElementById('dashboard-content').classList.add('hidden'); }
        else {
            document.getElementById('empty-dashboard').classList.add('hidden'); document.getElementById('dashboard-content').classList.remove('hidden');
            let sum=0, max=0, errs={knowledge:0,calculation:0,reading:0,time:0,guess:0,human_error:0};
            uSims.forEach(s=>{ sum+=s.score; if(s.score>max) max=s.score; if(s.errors) for(let k in errs) errs[k]+=(s.errors[k]||0); });
            document.getElementById('dash-score').innerText = Math.round(sum/uSims.length); document.getElementById('dash-max').innerText = max;
            
            if(errChart) errChart.destroy();
            errChart=new Chart(document.getElementById('errorsChart'),{type:'doughnut',data:{labels:['ידע','חישוב','קריאה','זמן','ניחוש/אנוש'],datasets:[{data:[errs.knowledge,errs.calculation,errs.reading,errs.time,errs.guess+errs.human_error],backgroundColor:['#ef4444','#f97316','#eab308','#3b82f6','#8b5cf6']}]},options:{maintainAspectRatio:false}});
            
            let ul=document.getElementById('ai-recs'); ul.innerHTML=''; let tr=Object.values(errs).reduce((a,b)=>a+b,0);
            if(tr>0){ 
                if(errs.calculation/tr>0.2)ul.innerHTML+='<li><span class="bg-brand-100 text-brand-800 px-2 rounded font-bold ml-1 text-sm">היסטורי</span> 🔢 זיהינו אצלך אחוז גבוה של טעויות חישוב היסטוריות - חובה טיוטה!</li>'; 
                if(errs.time/tr>0.15)ul.innerHTML+='<li><span class="bg-brand-100 text-brand-800 px-2 rounded font-bold ml-1 text-sm">היסטורי</span> ⏳ בעיית זמנים מובהקת - דלג מהר יותר על שאלות קשות.</li>'; 
                if(errs.reading/tr>0.15)ul.innerHTML+='<li><span class="bg-brand-100 text-brand-800 px-2 rounded font-bold ml-1 text-sm">היסטורי</span> 📖 קריאה שגויה חוזרת - סמן מילות מפתח בשאלה.</li>';
                if(errs.knowledge/tr>0.25)ul.innerHTML+='<li><span class="bg-brand-100 text-brand-800 px-2 rounded font-bold ml-1 text-sm">היסטורי</span> 🧠 פער ידע - חזור על חוקי הבסיס בנושאים החלשים שלך (ראה יומן טעויות).</li>';
            } else ul.innerHTML='<li>🚀 הביצועים מושלמים! המשך לתרגל כך.</li>';
        }
        
        let tb=document.getElementById('history-tbody'); tb.innerHTML='';
        [...uSims].reverse().forEach(s=>{
            let acts = `<div class="flex justify-center gap-2">
                <button onclick="openSum('${s.id}')" class="text-sm bg-brand-100 text-brand-700 px-3 py-1 rounded-lg font-bold hover:bg-brand-200 transition" title="צפה בתחקיר"><i class="fa-solid fa-eye"></i></button>
                <button onclick="downloadPDF('${s.id}')" class="text-sm bg-red-100 text-red-700 px-3 py-1 rounded-lg font-bold hover:bg-red-200 transition" title="הורד PDF"><i class="fa-solid fa-file-pdf"></i></button>
                <button onclick="openShareModal(${s.score}, '${s.simName}')" class="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-bold hover:bg-blue-200 transition" title="שתף לחבר"><i class="fa-solid fa-share-nodes"></i></button>
            </div>`;
            tb.innerHTML+=`<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition"><td class="py-4 px-2 whitespace-nowrap">${s.date}</td><td class="py-4 px-2 font-bold">${s.simName}</td><td class="py-4 px-2 text-center text-brand-600 font-bold text-lg">${s.score}</td><td class="py-4 px-2">${acts}</td></tr>`;
        });
    } catch(e) { console.error(e); }
    hideL();
}

async function loadDiary() {
    if(!uSims || uSims.length===0) await loadDash();
    let topics = {};
    uSims.forEach(s => {
        if(s.fullData) {
            ['q1','q2','v1','v2'].forEach(c => {
                if(s.fullData[c]) {
                    s.fullData[c].forEach(q => {
                        let t = q.topic;
                        if(!topics[t]) topics[t] = {t:0, c:0, errs:[]};
                        topics[t].t++;
                        if(q.user == q.correct && q.user!=='') topics[t].c++;
                        else if(q.reason) topics[t].errs.push(rCauses.find(x=>x.id===q.reason)?.t || 'אחר');
                    });
                }
            });
        }
    });
    
    let arr = Object.keys(topics).map(k => { return { name: k, total: topics[k].t, correct: topics[k].c, pct: Math.round((topics[k].c/topics[k].t)*100), errs: topics[k].errs }; }).filter(x=>x.total > 0).sort((a,b)=> b.pct - a.pct); 
    
    let st = document.getElementById('diary-strong'); st.innerHTML='';
    let wk = document.getElementById('diary-weak'); wk.innerHTML='';
    
    if(arr.length === 0) {
        st.innerHTML = '<li class="text-gray-500">אין מספיק נתונים.</li>'; wk.innerHTML = '<li class="text-gray-500">אין מספיק נתונים.</li>';
        return;
    }

    arr.forEach(item => {
        let text = `<b>${item.name}</b> <span class="text-sm bg-white dark:bg-gray-800 px-2 py-1 rounded-md shadow-sm border">${item.pct}% הצלחה</span>`;
        if(item.pct >= 70) {
            st.innerHTML += `<li class="flex justify-between items-center">${text}</li>`;
        } else {
            let mce = "לא ידוע";
            if(item.errs.length > 0) {
                let cnts = item.errs.reduce((acc, curr) => { acc[curr] = (acc[curr] || 0) + 1; return acc; }, {});
                mce = Object.keys(cnts).reduce((a, b) => cnts[a] > cnts[b] ? a : b);
            }
            wk.innerHTML += `<li class="flex flex-col gap-1 border-b border-red-100 pb-2">${text} <span class="text-xs text-red-600">עיקר הטעויות: ${mce}</span></li>`;
        }
    });
    if(st.innerHTML==='') st.innerHTML='<li class="text-gray-500">טרם נמצאו נושאים עם אחוזי הצלחה גבוהים.</li>';
    if(wk.innerHTML==='') wk.innerHTML='<li class="text-gray-500">כל הכבוד! אין נושאים חלשים.</li>';
}

window.startInputFlow = ()=>{
    cSim = document.getElementById('sim-selector').value; simD={q1:[],q2:[],v1:[],v2:[]};
    ['q1','q2','v1','v2'].forEach(c=>{ simKeys[cSim].c[c].forEach(q=>simD[c].push({user:'',correct:q.ans,topic:q.topic,reason:'',notes:''})); });
    aPhase='IN'; document.getElementById('flow-title').innerText='שלב 1: הזנה מהירה'; window.navigate('flow'); window.switchTab('q1');
};

window.switchTab = (t)=>{
    aTab=t; ['q1','q2','v1','v2'].forEach(x=>{ document.getElementById('tab-'+x).className=`flex-1 py-3 px-4 transition ${x===t?'tab-active':'tab-inactive'} whitespace-nowrap`; });
    let h='', b=document.getElementById('flow-tbody'); b.innerHTML='';
    
    if(aPhase==='IN'){
        h='<tr><th class="pb-2 w-28 text-center">שאלה ונושא</th><th class="pb-2 text-center">תשובה (1-4)</th></tr>';
        simD[aTab].forEach((q,i)=>b.innerHTML+=`<tr class="hover:bg-gray-50 transition border-b border-gray-100 dark:border-gray-800"><td class="py-3 text-center font-bold text-gray-700 dark:text-gray-300">${i+1}<div class="text-[11px] font-normal text-brand-600 dark:text-brand-400 leading-tight mt-1 bg-brand-50 dark:bg-brand-900/30 inline-block px-2 py-0.5 rounded">${q.topic}</div></td><td class="py-3 text-center"><input type="number" id="inp-${i}" value="${q.user}" class="border-2 rounded-lg p-3 w-16 text-center font-bold text-xl dark-card focus:border-brand-500 outline-none" oninput="fastInp(this,${i})"></td></tr>`);
    } else {
        h='<tr><th class="pb-2 w-24">שאלה ונושא</th><th class="pb-2 w-16 text-center">שלך</th><th class="pb-2 w-16 text-center">נכונה</th><th class="pb-2 text-right">סיבת טעות</th><th class="pb-2 text-right">הערה / מסקנה</th></tr>';
        simD[aTab].forEach((q,i)=>{
            if(q.user==q.correct&&q.user!=='') b.innerHTML+=`<tr class="bg-gray-50 dark:bg-gray-800 opacity-70 text-center border-b border-gray-100 dark:border-gray-700"><td class="py-3 font-bold">${i+1}<div class="text-[10px] font-normal text-gray-500 leading-tight mt-1">${q.topic}</div></td><td colspan="4" class="text-green-600 font-bold"><i class="fa-solid fa-check"></i> תקין</td></tr>`;
            else {
                let op=rCauses.map(rc=>`<option value="${rc.id}" ${q.reason===rc.id?'selected':''}>${rc.t}</option>`).join('');
                b.innerHTML+=`<tr class="text-center border-b border-red-100 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/10 transition"><td class="py-3 font-bold">${i+1}<div class="text-[10px] font-normal text-brand-600 dark:text-brand-400 leading-tight mt-1">${q.topic}</div></td><td class="text-red-500 font-bold text-lg">${q.user||'-'}</td><td class="text-green-500 font-bold text-lg">${q.correct}</td><td class="px-2"><select class="w-full border-2 rounded-xl p-2 dark-card outline-none focus:border-brand-500" onchange="updR(${i},this.value)">${op}</select></td><td class="px-2"><input type="text" class="w-full border-2 rounded-xl p-2 dark-card outline-none focus:border-brand-500" value="${q.notes}" oninput="updN(${i},this.value)"></td></tr>`;
            }
        });
    }
    document.getElementById('flow-thead').innerHTML=h; updProg(); setTimeout(()=>scrollT(),50);
};

window.fastInp = (el,i)=>{ let v=el.value; if(v!==''&&(v<1||v>4))v=''; simD[aTab][i].user=v; el.value=v; if(v>=1&&v<=4){ let nx=document.getElementById(`inp-${i+1}`); if(nx)nx.focus(); else{ if(aTab==='q1')switchTab('q2');else if(aTab==='q2')switchTab('v1');else if(aTab==='v1')switchTab('v2'); } } updProg(); };
const updProg = () => { let f = 0, total = 0; ['q1','q2','v1','v2'].forEach(c => { f += simD[c].filter(x => x.user !== '').length; total += simD[c].length; }); document.getElementById('prog-bar').style.width = (f / total) * 100 + '%'; };
window.updR = (i,v)=>simD[aTab][i].reason=v; window.updN = (i,v)=>simD[aTab][i].notes=v;
window.nextPhase = ()=>{ if(aPhase==='IN'){ let e=0;['q1','q2','v1','v2'].forEach(c=>e+=simD[c].filter(x=>x.user==='').length); if(e>0&&!confirm(`השארת ${e} שאלות ריקות. לעבור לתחקור בכל זאת?`))return; aPhase='AN'; document.getElementById('flow-title').innerText='שלב 2: תחקור סימולציה'; document.getElementById('flow-btn').innerText='סיים וצפה בתוצאות'; window.switchTab('q1'); } else { document.getElementById('flow-container').classList.add('hidden'); renderSum(simD, simKeys[cSim].n, false); } };

window.openSum = (id)=>{ let s=uSims.find(x=>x.id===id); document.getElementById('history-page').classList.add('hidden'); renderSum(s.fullData||{}, s.simName, true, s.score); };
window.closeSummary = ()=>{ document.getElementById('phase-summary').classList.add('hidden'); document.getElementById('history-page').classList.remove('hidden'); setTimeout(()=>scrollT(),50); };

function renderSum(d, nm, isH, pSc){
    document.getElementById('phase-summary').classList.remove('hidden'); document.getElementById('close-sum').style.display=isH?'block':'none'; document.getElementById('save-sum').style.display=isH?'none':'block'; document.getElementById('sum-title').innerText=nm;
    let cor=0, top={}, flatM=[], totalQs=0; 
    
    ['q1','q2','v1','v2'].forEach(c=>{ 
        if(!d[c]) return;
        totalQs += d[c].length;
        d[c].forEach((q,idx)=>{ 
            let t = q.topic; let uA = q.user; let cA = q.correct;
            if(!top[t])top[t]={t:0,c:0}; top[t].t++; 
            if(uA==cA && uA!==''){cor++;top[t].c++;} else flatM.push({c, idx:idx+1, q});
        }) 
    });

    let rawQ = (d.q1 ? d.q1.filter(x=>x.user==x.correct&&x.user!=='').length : 0) + (d.q2 ? d.q2.filter(x=>x.user==x.correct&&x.user!=='').length : 0);
    let rawV = (d.v1 ? d.v1.filter(x=>x.user==x.correct&&x.user!=='').length : 0) + (d.v2 ? d.v2.filter(x=>x.user==x.correct&&x.user!=='').length : 0);
    
    let currentSimKey = Object.keys(simKeys).find(k => simKeys[k].n === nm) || 'summer_2026';
    let realScores = calculateRealPsychoScore(rawV, rawQ, currentSimKey);

    document.getElementById('sum-score').innerText = pSc || realScores.multi;
    document.getElementById('sum-score-quant').innerText = realScores.quantEmp;
    document.getElementById('sum-score-verbal').innerText = realScores.verbalEmp;
    document.getElementById('emphasis-scores').classList.remove('hidden');
    
    document.getElementById('sq1').innerText=d.q1 ? `${d.q1.filter(x=>x.user==x.correct&&x.user!=='').length}/${d.q1.length}` : '-'; 
    document.getElementById('sq2').innerText=d.q2 ? `${d.q2.filter(x=>x.user==x.correct&&x.user!=='').length}/${d.q2.length}` : '-';
    document.getElementById('sv1').innerText=d.v1 ? `${d.v1.filter(x=>x.user==x.correct&&x.user!=='').length}/${d.v1.length}` : '-'; 
    document.getElementById('sv2').innerText=d.v2 ? `${d.v2.filter(x=>x.user==x.correct&&x.user!=='').length}/${d.v2.length}` : '-';

    let tl=Object.keys(top), td=tl.map(x=>Math.round((top[x].c/top[x].t)*100));
    if(radChart) radChart.destroy();
    radChart = new Chart(document.getElementById('radarChart'),{type:'radar',data:{labels:tl,datasets:[{label:'%',data:td,backgroundColor:'rgba(99, 102, 241, 0.2)',borderColor:'#6366f1',pointBackgroundColor:'#6366f1'}]},options:{scales:{r:{angleLines:{display:false},suggestedMin:0,suggestedMax:100}},maintainAspectRatio:false}});
    
    let insUI = document.getElementById('sum-insights'); insUI.innerHTML='';
    if(tl.length>0){
        let weakest = tl[td.indexOf(Math.min(...td))]; let strongest = tl[td.indexOf(Math.max(...td))];
        insUI.innerHTML+=`<li>הנושא החזק במועד: <b class="text-green-600">${strongest}</b>.</li><li>הנושא הדורש חזרה: <b class="text-red-500">${weakest}</b>.</li>`;
        if((cor/totalQs) > 0.75) insUI.innerHTML+=`<li>פצצה! אתה במגמת שיפור.</li>`;
    }

    let mH=''; tl.forEach(t=>{ 
        let ml=flatM.filter(m=>m.q.topic===t); 
        if(ml.length>0){ mH+=`<b class="block mt-4 text-red-900 border-b border-red-200">${t}</b><ul class="list-disc pr-4 mt-2">`; ml.forEach(m=>{ mH+=`<li><b>${chpNames[m.c]} | שאלה ${m.idx}</b>: ${rCauses.find(x=>x.id===m.q.reason)?.t||'אנוש'}. ${m.q.notes?`<span class="text-gray-500 text-xs">"${m.q.notes}"</span>`:''}</li>`; }); mH+='</ul>'; } 
    });
    document.getElementById('sum-mistakes').innerHTML=mH||'<div class="text-green-600 font-bold mt-4">אין טעויות! ביצוע מושלם.</div>'; setTimeout(()=>scrollT(),50);
}

window.saveSim = async ()=>{
    showL(); 
    let e={knowledge:0,calculation:0,reading:0,time:0,guess:0,human_error:0}; 
    let rawQ = 0, rawV = 0, c = 0;
    
    ['q1','q2'].forEach(x=>simD[x].forEach(q=>{ 
        if(q.user==q.correct&&q.user!=='') { rawQ++; c++; }
        else if(q.reason) e[q.reason]++; else e.human_error++; 
    }));
    ['v1','v2'].forEach(x=>simD[x].forEach(q=>{ 
        if(q.user==q.correct&&q.user!=='') { rawV++; c++; }
        else if(q.reason) e[q.reason]++; else e.human_error++; 
    }));
    
    let calculatedScores = calculateRealPsychoScore(rawV, rawQ, cSim);

    try { 
        await addDoc(collection(db,"simulations"),{ username:window.currentUser, timestamp:Date.now(), date:new Date().toLocaleDateString('he'), simName:simKeys[cSim].n, score: calculatedScores.multi, advancedScores: calculatedScores, totalCorrect: c, errors: e, fullData: simD }); 
        document.getElementById('phase-summary').classList.add('hidden'); 
        window.navigate('dashboard'); 
    } catch(ex){ alert("שגיאה בשמירה!"); console.error(ex); } 
    hideL();
};

window.downloadPDF = (simId) => { let s = uSims.find(x=>x.id===simId); renderSum(s.fullData||{}, s.simName, true, s.score); let element = document.getElementById('pdf-content'); let opt = { margin: 10, filename: `Takhkir_${s.simName}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; html2pdf().set(opt).from(element).save().then(()=>{ closeSummary(); }); };
window.openShareModal = (score, simName) => { if(!uData.friends || uData.friends.length === 0) { alert("אין לך חברים ברשימה לשתף איתם."); return; } let sel = document.getElementById('share-friend-sel'); sel.innerHTML = ''; uData.friends.forEach(f => { sel.innerHTML += `<option value="${f}">${f}</option>`; }); sel.innerHTML += `<option value="global_group">🌐 חדר למידה משותף</option>`; document.getElementById('btn-do-share').onclick = async () => { let friend = sel.value; let isGroup = friend === 'global_group'; let room = isGroup ? 'global_group_room' : [window.currentUser,friend].sort().join('_'); let txt = `היי! קיבלתי ציון *${score}* (רב-תחומי) ב${simName}! 🎉`; try { await addDoc(collection(db,"chats"),{room: room, s:window.currentUser, t:txt, ts:Date.now()}); document.getElementById('share-modal').classList.add('hidden'); alert("שותף בהצלחה!"); } catch(e) { alert("שגיאה בשיתוף."); console.error(e); } }; document.getElementById('share-modal').classList.remove('hidden'); };

let timerInt = null, tLeft = 0, chaps = [{n:'פרק חיבור',m:30},{n:'פרק 1',m:20},{n:'פרק 2',m:20},{n:'פרק 3',m:20},{n:'פרק 4',m:20},{n:'פרק 5',m:20}]; let currChIdx = 0, isTicking = false, beepDone = false;
window.toggleTimer = () => { if(!timerInt && tLeft === 0) { tLeft = chaps[currChIdx].m * 60; beepDone = false; } if(isTicking) { clearInterval(timerInt); isTicking = false; document.getElementById('icon-timer-toggle').className = 'fa-solid fa-play'; } else { isTicking = true; document.getElementById('icon-timer-toggle').className = 'fa-solid fa-pause'; timerInt = setInterval(timerTick, 1000); } };
const timerTick = () => { tLeft--; if(tLeft <= 0) { clearInterval(timerInt); tLeft=0; isTicking=false; document.getElementById('icon-timer-toggle').className = 'fa-solid fa-play'; document.getElementById('timer-circle-ui').classList.remove('warning'); alert("הזמן נגמר!"); } let m = Math.floor(tLeft/60), s = tLeft%60; document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; if(tLeft <= 300 && tLeft > 0) { document.getElementById('timer-circle-ui').classList.add('warning'); if(!beepDone && document.getElementById('timer-sound-toggle').checked) { playBeep(); beepDone = true; } } else { document.getElementById('timer-circle-ui').classList.remove('warning'); } };
window.nextTimerChap = () => { if(currChIdx < chaps.length - 1) { currChIdx++; } else { currChIdx = 0; } resetTimerCore(); };
window.resetTimer = () => resetTimerCore();
const resetTimerCore = () => { clearInterval(timerInt); isTicking = false; beepDone = false; document.getElementById('icon-timer-toggle').className = 'fa-solid fa-play'; document.getElementById('timer-circle-ui').classList.remove('warning'); document.getElementById('timer-chap-name').innerText = `${chaps[currChIdx].n} (${chaps[currChIdx].m} דק')`; document.getElementById('timer-chap-idx').innerText = currChIdx + 1; tLeft = chaps[currChIdx].m * 60; let m = Math.floor(tLeft/60), s = tLeft%60; document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; };

function checkRequestsUI(){ document.getElementById('nav-req-badge').style.display = (uData.reqs && uData.reqs.length>0) ? 'flex' : 'none'; }
window.searchFriend = async ()=>{ let v=document.getElementById('f-search').value.trim(); if(!v||v===window.currentUser)return; let resArea = document.getElementById('search-res-area'); resArea.innerHTML='<i class="fa-solid fa-spinner animate-spin"></i> מחפש...'; try{ let d=await getDoc(doc(db,"users",v)); if(!d.exists()||d.data().isPrivate) { resArea.innerHTML='<div class="text-red-500 font-bold mt-2 bg-red-50 p-2 rounded-lg border border-red-200">המשתמש לא קיים או שחשבונו פרטי.</div>'; return; } let s = await getDocs(query(collection(db,"simulations"), where("username","==",v))); let count=0, max=0, sum=0; s.forEach(x=>{ count++; let sc=x.data().score; sum+=sc; if(sc>max)max=sc; }); let avg = count>0?Math.round(sum/count):0; resArea.innerHTML = `<div class="dark-card border-2 border-brand-200 rounded-2xl p-6 mt-4 text-center shadow-lg"><div class="w-20 h-20 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-4xl font-black mx-auto mb-3">${v.charAt(0).toUpperCase()}</div><h4 class="font-bold text-2xl mb-1">${d.data().fullName || v}</h4><p class="text-gray-500 text-sm mb-4">@${v}</p><div class="flex justify-center gap-3 mb-6 text-sm"><div class="bg-gray-50 px-4 py-2 rounded-xl border">ממוצע: <b class="text-lg block">${avg||'-'}</b></div><div class="bg-gray-50 px-4 py-2 rounded-xl border">שיא: <b class="text-lg block">${max||'-'}</b></div></div><button onclick="sendFriendReq('${v}')" class="bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-6 rounded-xl w-full transition shadow">שלח בקשת חברות</button></div>`; }catch(e){ resArea.innerHTML='שגיאה בחיפוש.'; console.error(e);} };
window.sendFriendReq = async (v)=>{ try { await setDoc(doc(db,"users",v), {reqs: arrayUnion(window.currentUser)}, {merge:true}); alert("בקשת חברות נשלחה בהצלחה למשתמש "+v+"!"); document.getElementById('search-res-area').innerHTML=''; document.getElementById('f-search').value=''; } catch(e){ alert("שגיאה בשליחת הבקשה."); console.error(e); } };

async function loadFriends(){
    let rA=document.getElementById('incoming-req-area'); rA.innerHTML='';
    if(uData.reqs && uData.reqs.length>0) { rA.innerHTML = '<h3 class="font-bold text-sm text-brand-600 mb-2">בקשות חברות ממתינות:</h3>'; uData.reqs.forEach(r=>rA.innerHTML+=`<div class="bg-yellow-50 dark-card p-4 rounded-xl flex justify-between items-center border border-yellow-200 mb-2 shadow-sm"><span class="font-medium">בקשה מ: <b>${r}</b></span> <div class="flex gap-2"><button onclick="ansReq('${r}',true)" class="bg-green-500 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-green-600 transition">אשר</button><button onclick="ansReq('${r}',false)" class="bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-bold hover:bg-red-200 transition">דחה</button></div></div>`); }
    let fL=document.getElementById('friends-list'); fL.innerHTML='';
    fL.innerHTML += `<li onclick="openChat('global_group')" class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl cursor-pointer border border-blue-200 font-bold flex items-center gap-4 transition hover:shadow-md mb-2"><div class="w-12 h-12 rounded-full bg-blue-500 text-white flex justify-center items-center text-xl shadow"><i class="fa-solid fa-earth-americas"></i></div><div><div class="text-lg">חדר למידה ארצי</div><div class="text-xs font-normal text-gray-500">קבוצה ציבורית</div></div></li>`;
    if(uData.friends && uData.friends.length>0) { uData.friends.forEach(f=>fL.innerHTML+=`<li onclick="openChat('${f}')" class="p-3 bg-white dark:bg-gray-700 rounded-xl cursor-pointer hover:bg-brand-50 dark:hover:bg-gray-600 border font-bold flex items-center gap-3 transition shadow-sm"><div class="w-10 h-10 rounded-full bg-brand-100 text-brand-800 flex justify-center items-center text-lg">${f.charAt(0).toUpperCase()}</div>${f}</li>`); }
}

window.ansReq = async (f, isAcc)=>{ showL(); await setDoc(doc(db,"users",window.currentUser),{reqs:arrayRemove(f)}, {merge:true}); if(isAcc){ await setDoc(doc(db,"users",window.currentUser),{friends:arrayUnion(f)}, {merge:true}); await setDoc(doc(db,"users",f),{friends:arrayUnion(window.currentUser)}, {merge:true}); } hideL(); };
window.openChat = (f)=>{ activeChat=f; document.getElementById('chat-placeholder').style.display='none'; document.getElementById('chat-area').style.display='flex'; let isGroup = f === 'global_group'; document.getElementById('chat-user-name').innerText= isGroup ? 'חדר למידה ארצי' : f; document.getElementById('chat-av').innerHTML= isGroup ? '<i class="fa-solid fa-earth-americas"></i>' : f.charAt(0).toUpperCase(); document.getElementById('chat-profile-btn').style.display = isGroup ? 'none' : 'block'; let rm = isGroup ? 'global_group_room' : [window.currentUser,f].sort().join('_'); if(chatUnsub) chatUnsub(); chatUnsub = onSnapshot(query(collection(db,"chats"),where("room","==",rm)),(s)=>{ let md=document.getElementById('chat-messages'); md.innerHTML=''; let ms=[]; s.forEach(d=>ms.push(d.data())); ms.sort((a,b)=>a.ts-b.ts); ms.forEach(m=>{ let isMe = m.s===window.currentUser; let timeStr = new Date(m.ts).toLocaleTimeString('he',{hour:'2-digit',minute:'2-digit'}); let senderNameHtml = (isGroup && !isMe) ? `<div class="text-[10px] font-bold text-brand-700 mb-1">${m.s}</div>` : ''; md.innerHTML+=`<div class="p-3 w-max max-w-[85%] flex flex-col ${isMe?'chat-bubble-me':'chat-bubble-friend'}">${senderNameHtml}<p class="text-md">${m.t}</p><span class="text-[10px] opacity-70 text-left mt-1 block">${timeStr}</span></div>`; }); setTimeout(()=>md.scrollTop=md.scrollHeight,50); }); };
window.sendMsg = async ()=>{ let v=document.getElementById('chat-input').value; if(!v)return; document.getElementById('chat-input').value=''; let isGroup = activeChat === 'global_group'; let rm = isGroup ? 'global_group_room' : [window.currentUser,activeChat].sort().join('_'); await addDoc(collection(db,"chats"),{room:rm, s:window.currentUser, t:v, ts:Date.now()}); };
window.closeProfileModal = () => { document.getElementById('profile-modal').classList.add('hidden'); };
window.viewFriendProfileModal = async ()=>{ if(activeChat === 'global_group') return; showL(); try { let uD = await getDoc(doc(db,"users",activeChat)); if(uD.exists()){ let dat = uD.data(); document.getElementById('modal-uname').innerText = dat.fullName || activeChat; document.getElementById('modal-bio').innerText = dat.bio || ''; if(dat.isPrivate) { document.getElementById('modal-stats-area').style.display = 'none'; document.getElementById('modal-private-msg').style.display = 'block'; } else { document.getElementById('modal-stats-area').style.display = 'block'; document.getElementById('modal-private-msg').style.display = 'none'; let d=await getDocs(query(collection(db,"simulations"),where("username","==",activeChat))); let max=0, c=0, sum=0; let fSims = []; d.forEach(x=>{ let data = x.data(); c++; if(data.score>max) max=data.score; sum+=data.score; fSims.push(data); }); fSims.sort((a,b) => b.timestamp - a.timestamp); let avg = c>0 ? Math.round(sum/c) : 0; document.getElementById('modal-count').innerText = c; document.getElementById('modal-avg').innerText = avg; document.getElementById('modal-max').innerText = max; let histUl = document.getElementById('modal-history'); histUl.innerHTML = ''; if(c > 0) { fSims.slice(0, 5).forEach(s => { histUl.innerHTML += `<li class="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-3 rounded-xl text-sm mb-2"><span class="text-gray-500">${s.date}</span> <span class="font-bold">${s.simName}</span> <b class="text-brand-600 text-lg">${s.score}</b></li>`; }); } else { histUl.innerHTML = '<li class="text-center text-gray-400 text-sm py-4">טרם ביצע תחקירים.</li>'; } } } document.getElementById('modal-av').innerText = activeChat.charAt(0).toUpperCase(); document.getElementById('profile-modal').classList.remove('hidden'); } catch(e){ console.error(e); } hideL(); };

async function loadArena(){ showL(); let tb=document.getElementById('arena-tbody'); tb.innerHTML=''; try { let ud=await getDocs(collection(db,"users")), priv=new Set(); let nameMap = {}; ud.forEach(x=>{ let d = x.data(); if(d.isPrivate) priv.add(x.id); nameMap[x.id] = d.fullName || x.id; }); let sd=await getDocs(collection(db,"simulations")), ag={}; sd.forEach(x=>{let s=x.data(); let un=s.username; if(priv.has(un))return; if(!ag[un])ag[un]={s:0,c:0,m:0}; ag[un].s+=s.score; ag[un].c++; if(s.score>ag[un].m)ag[un].m=s.score;}); let ra=Object.keys(ag).map(k=>({u:k, n:nameMap[k], a:Math.round(ag[k].s/ag[k].c), m:ag[k].m})).sort((a,b)=>b.a-a.a); ra.slice(0,20).forEach((u,i)=>tb.innerHTML+=`<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition"><td class="py-4 px-4">${i<3?`<i class="fa-solid fa-medal text-${i===0?'yellow-500':i===1?'gray-400':'orange-400'} text-3xl drop-shadow"></i>`:`<span class="text-xl font-bold text-gray-400">#${i+1}</span>`}</td><td class="py-4 px-4 font-bold text-black dark:text-white text-lg">${u.n} <span class="text-sm font-normal text-gray-400 block">@${u.u}</span> ${u.u===window.currentUser?'<span class="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-md font-bold mt-1 inline-block">זה אתה</span>':''}</td><td class="py-4 px-4 font-black text-brand-600 text-center text-3xl">${u.a}</td><td class="py-4 px-4 text-gray-500 font-bold text-center text-xl">${u.m}</td></tr>`); } catch(e){console.error(e);} hideL(); }
// ================= MATH GAME LOGIC & ARENA TABS =================
let mathInterval = null;
let mathTime = 60;
let mathScore = 0;
let expectedAnswer = 0;

window.switchArenaTab = (tab) => {
    document.getElementById('tab-arena-lead').className = `flex-1 py-3 text-lg transition whitespace-nowrap ${tab==='leaderboard'?'tab-active':'tab-inactive'}`;
    document.getElementById('tab-arena-games').className = `flex-1 py-3 text-lg transition whitespace-nowrap ${tab==='games'?'tab-active':'tab-inactive'}`;
    
    document.getElementById('arena-leaderboard-view').style.display = tab==='leaderboard' ? 'block' : 'none';
    document.getElementById('arena-games-view').style.display = tab==='games' ? 'block' : 'none';
    
    if(tab === 'games') updateDailyUI();
};

function updateDailyUI() {
    if(!uData) return;
    let todayStr = new Date().toLocaleDateString('he');
    // איפוס יומי במידת הצורך
    if(uData.lastPlayedDate !== todayStr) {
        uData.dailyPoints = 0;
        setDoc(doc(db,"users",window.currentUser), { dailyPoints: 0, lastPlayedDate: todayStr }, {merge:true});
    }
    
    let xp = uData.xp || 0;
    let daily = uData.dailyPoints || 0;
    document.getElementById('math-daily-points').innerText = daily;
    document.getElementById('math-daily-prog').style.width = Math.min((daily / 100) * 100, 100) + '%';
}

window.startMathGame = (mode) => {
    if(mode === 'solo') {
        document.getElementById('math-menu').classList.add('hidden');
        document.getElementById('math-active-game').classList.remove('hidden');
        mathScore = 0;
        mathTime = 60;
        document.getElementById('math-score-ui').innerText = mathScore;
        document.getElementById('math-timer-ui').innerText = mathTime;
        document.getElementById('math-answer-input').value = '';
        document.getElementById('math-answer-input').focus();
        
        generateMathQuestion();
        
        if(mathInterval) clearInterval(mathInterval);
        mathInterval = setInterval(() => {
            mathTime--;
            document.getElementById('math-timer-ui').innerText = mathTime;
            if(mathTime <= 0) window.endMathGame();
        }, 1000);
    }
};

window.showMultiplayerLobby = () => {
  // ================= MULTIPLAYER GAME LOGIC =================
let multiGameId = null;
let isPlayer1 = false;
let multiUnsub = null;
let multiTimerInt = null;
let multiExpectedAnswer = 0;
let myMultiScore = 0;

window.showMultiplayerLobby = async () => {
    document.getElementById('math-menu').classList.add('hidden');
    document.getElementById('multi-lobby-ui').classList.remove('hidden');
    
    try {
        // מחפשים חדר פנוי שממתין לשחקן
        let q = query(collection(db, "games"), where("status", "==", "waiting"));
        let snap = await getDocs(q);
        
        if (!snap.empty) {
            // מצאנו חדר! מצטרפים כשחקן 2
            let gameDoc = snap.docs[0];
            multiGameId = gameDoc.id;
            isPlayer1 = false;
            await setDoc(doc(db, "games", multiGameId), { p2: uData.fullName || window.currentUser, status: "playing" }, {merge: true});
            listenToMultiGame(multiGameId);
        } else {
            // לא מצאנו חדר - פותחים אחד חדש כשחקן 1
            let newGame = await addDoc(collection(db, "games"), {
                p1: uData.fullName || window.currentUser, p2: "ממתין...", p1Score: 0, p2Score: 0, status: "waiting", ts: Date.now()
            });
            multiGameId = newGame.id;
            isPlayer1 = true;
            listenToMultiGame(multiGameId);
        }
    } catch (e) {
        alert("שגיאה בהתחברות לשרת המשחקים.");
        window.cancelMultiplayer();
    }
};

window.cancelMultiplayer = () => {
    if(multiUnsub) multiUnsub();
    if(multiGameId && isPlayer1) {
        // אם פתחנו חדר והתחרטנו, נשנה את הסטטוס לבוטל
        setDoc(doc(db, "games", multiGameId), { status: "cancelled" }, {merge: true});
    }
    document.getElementById('multi-lobby-ui').classList.add('hidden');
    document.getElementById('math-menu').classList.remove('hidden');
    multiGameId = null;
};

function listenToMultiGame(gId) {
    if(multiUnsub) multiUnsub();
    myMultiScore = 0;
    
    multiUnsub = onSnapshot(doc(db, "games", gId), (docSnap) => {
        let data = docSnap.data();
        if(!data) return;

        // אם המשחק בוטל
        if(data.status === "cancelled") {
            alert("היריב עזב את החדר.");
            window.cancelMultiplayer();
            return;
        }

        // ברגע שהסטטוס משתנה ל-playing, מתחילים!
        if(data.status === "playing" && document.getElementById('multi-active-game').classList.contains('hidden')) {
            document.getElementById('multi-lobby-ui').classList.add('hidden');
            document.getElementById('multi-active-game').classList.remove('hidden');
            
            // עדכון שמות השחקנים
            document.getElementById('multi-p1-name').innerText = isPlayer1 ? (data.p1 + " (אתה)") : data.p1;
            document.getElementById('multi-p2-name').innerText = !isPlayer1 ? (data.p2 + " (אתה)") : data.p2;
            document.getElementById('multi-p1-score').innerText = "0";
            document.getElementById('multi-p2-score').innerText = "0";
            document.getElementById('multi-answer-input').value = '';
            document.getElementById('multi-answer-input').focus();
            
            generateMultiQuestion();
            
            // שחקן 1 (המארח) אחראי על ניהול שעון המשחק בשרת
            if (isPlayer1) {
                let timeLeft = 60;
                multiTimerInt = setInterval(() => {
                    timeLeft--;
                    setDoc(doc(db, "games", gId), { time: timeLeft }, {merge: true});
                    if (timeLeft <= 0) {
                        clearInterval(multiTimerInt);
                        setDoc(doc(db, "games", gId), { status: "finished" }, {merge: true});
                    }
                }, 1000);
            }
        }

        // סנכרון נתונים חיים (טיימר וניקוד)
        if(data.status === "playing") {
            if(data.time !== undefined) document.getElementById('multi-timer-ui').innerText = data.time;
            document.getElementById('multi-p1-score').innerText = data.p1Score;
            document.getElementById('multi-p2-score').innerText = data.p2Score;
        }

        // סיום המשחק
        if(data.status === "finished") {
            if(multiUnsub) multiUnsub();
            if(multiTimerInt) clearInterval(multiTimerInt);
            document.getElementById('multi-active-game').classList.add('hidden');
            document.getElementById('math-menu').classList.remove('hidden');
            
            let won = (isPlayer1 && data.p1Score > data.p2Score) || (!isPlayer1 && data.p2Score > data.p1Score);
            let tie = data.p1Score === data.p2Score;
            
            let msg = tie ? "תיקו! משחק צמוד." : won ? "ניצחת בדו-קרב! 🏆" : "הפסדת בקרב הפעם.";
            
            // נותנים נקודות XP על ההישג
            let bonusXP = won ? 50 : tie ? 20 : 10; 
            let totalEarned = myMultiScore + bonusXP;
            
            alert(`המשחק נגמר! ${msg}\nהרווחת ${totalEarned} XP!`);
            
            let currentXP = uData.xp || 0;
            let currentDaily = uData.dailyPoints || 0;
            setDoc(doc(db,"users",window.currentUser), {
                xp: currentXP + totalEarned,
                dailyPoints: currentDaily + totalEarned
            }, {merge:true}).then(() => updateDailyUI());
            
            multiGameId = null;
        }
    });
}

function generateMultiQuestion() {
    let isDiv = Math.random() > 0.5;
    let a = Math.floor(Math.random() * 10) + 1;
    let b = Math.floor(Math.random() * 10) + 1;
    if(isDiv) {
        let c = a * b; multiExpectedAnswer = b;
        document.getElementById('multi-question-ui').innerText = `${c} ÷ ${a}`;
    } else {
        multiExpectedAnswer = a * b;
        document.getElementById('multi-question-ui').innerText = `${a} × ${b}`;
    }
}

window.checkMultiAnswer = () => {
    let inp = document.getElementById('multi-answer-input');
    if(parseInt(inp.value) === multiExpectedAnswer) {
        myMultiScore += 10;
        inp.value = '';
        generateMultiQuestion();
        
        // עדכון השרת בנקודות שלך
        if (isPlayer1) {
            setDoc(doc(db, "games", multiGameId), { p1Score: myMultiScore }, {merge: true});
        } else {
            setDoc(doc(db, "games", multiGameId), { p2Score: myMultiScore }, {merge: true});
        }
    }
};

function generateMathQuestion() {
    let isDiv = Math.random() > 0.5;
    let a = Math.floor(Math.random() * 10) + 1;
    let b = Math.floor(Math.random() * 10) + 1;
    
    if(isDiv) {
        let c = a * b;
        expectedAnswer = b;
        document.getElementById('math-question-ui').innerText = `${c} ÷ ${a}`;
    } else {
        expectedAnswer = a * b;
        document.getElementById('math-question-ui').innerText = `${a} × ${b}`;
    }
}

window.checkMathAnswer = () => {
    let inp = document.getElementById('math-answer-input');
    if(parseInt(inp.value) === expectedAnswer) {
        // תשובה נכונה!
        mathScore += 10;
        document.getElementById('math-score-ui').innerText = mathScore;
        inp.value = '';
        generateMathQuestion();
        
        // אנימציה קטנה של הצלחה
        let qUi = document.getElementById('math-question-ui');
        qUi.classList.add('text-green-500');
        setTimeout(() => qUi.classList.remove('text-green-500'), 200);
    }
};

window.endMathGame = async () => {
    clearInterval(mathInterval);
    document.getElementById('math-active-game').classList.add('hidden');
    document.getElementById('math-menu').classList.remove('hidden');
    
    if(mathScore > 0) {
        alert(`כל הכבוד! צברת ${mathScore} נקודות ניסיון (XP).`);
        let currentXP = uData.xp || 0;
        let currentDaily = uData.dailyPoints || 0;
        
        await setDoc(doc(db,"users",window.currentUser), {
            xp: currentXP + mathScore,
            dailyPoints: currentDaily + mathScore,
            lastPlayedDate: new Date().toLocaleDateString('he')
        }, {merge:true});
        
        updateDailyUI();
    }
};

// --- שדרוג האלגוריתם של הלידרבורד המקורי (יש להחליף את פונקציית loadArena הקיימת) ---
window.loadArena = async function() {
    showL(); 
    let tb=document.getElementById('arena-tbody'); tb.innerHTML='';
    try {
        let ud=await getDocs(collection(db,"users")), priv=new Set(), userStats={};
        ud.forEach(x => {
            let d = x.data();
            if(d.isPrivate) priv.add(x.id);
            userStats[x.id] = { n: d.fullName || x.id, xp: d.xp || 0 };
        });
        
        let sd=await getDocs(collection(db,"simulations")), ag={};
        sd.forEach(x => {
            let s=x.data(); let un=s.username; 
            if(priv.has(un)) return; 
            if(!ag[un]) ag[un] = { s:0, c:0 }; 
            ag[un].s += s.score; 
            ag[un].c++; 
        });
        
        // חישוב ציון משוקלל לדירוג: ממוצע סימולציות + בונוס מהמשחקים (כל 100 XP שווים נקודה בדירוג)
        let ra = Object.keys(userStats).map(k => {
            let avgScore = ag[k] ? Math.round(ag[k].s / ag[k].c) : 0;
            let xpBonus = Math.floor((userStats[k].xp) / 100);
            let combinedScore = avgScore > 0 ? avgScore + xpBonus : xpBonus; // אם אין סימולציות, הדירוג הוא רק מ-XP
            return { u:k, n:userStats[k].n, xp:userStats[k].xp, score: combinedScore };
        }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
        
        ra.slice(0,20).forEach((u,i) => {
            tb.innerHTML += `<tr class="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition"><td class="py-4 px-4">${i<3?`<i class="fa-solid fa-medal text-${i===0?'yellow-500':i===1?'gray-400':'orange-400'} text-3xl drop-shadow"></i>`:`<span class="text-xl font-bold text-gray-400">#${i+1}</span>`}</td><td class="py-4 px-4 font-bold text-black dark:text-white text-lg">${u.n} <span class="text-sm font-normal text-gray-400 block">@${u.u}</span> ${u.u===window.currentUser?'<span class="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-md font-bold mt-1 inline-block">זה אתה</span>':''}</td><td class="py-4 px-4 font-black text-brand-600 text-center text-3xl">${u.score}</td><td class="py-4 px-4 text-purple-500 font-bold text-center text-xl"><i class="fa-solid fa-star text-sm"></i> ${u.xp}</td></tr>`;
        });
    } catch(e) { console.error(e); }
    hideL();
}
window.updateSettings = async (t, v)=>{ if(t==='priv'){ uData.isPrivate=v; await setDoc(doc(db,"users",window.currentUser),{isPrivate:v},{merge:true}); } if(t==='theme'){ document.documentElement.setAttribute('data-theme',v); localStorage.setItem('pTheme',v); } if(t==='font'){ document.documentElement.style.setProperty('--base-size', v+'px'); localStorage.setItem('pFont',v); } };
window.saveProfileInfo = async () => { let fn = document.getElementById('prof-fullname').value.trim(); let bio = document.getElementById('prof-bio').value.trim(); await setDoc(doc(db,"users",window.currentUser),{fullName:fn, bio:bio},{merge:true}); };
