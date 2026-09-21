(() => {
'use strict';

const VERSION = '1.0.0';
const CLASS_INFO = [
  ['WA','Warrior'],['BL','Blader'],['WI','Wizard'],['FA','Force Archer'],['FS','Force Shielder'],
  ['FB','Force Blader'],['GL','Gladiator'],['DM','Dark Mage'],['FG','Force Gunner']
];
const CLASS_BY_CODE = Object.fromEntries(CLASS_INFO);
const CLASS_BY_NAME = Object.fromEntries(CLASS_INFO.map(([c,n]) => [n.toLowerCase(), c]));

const PROFILES = {
  weekly: {
    label:'Guild Weekly Ranking',
    columns:['Ranking','Character','Treasure Score'],
    required:['ranking','character','score'],
    bodyFactor:38,
  },
  legend: {
    label:'Legend Arena',
    columns:['Class','Ranking','Character','Total Score'],
    required:['ranking','character','total','score'],
    bodyFactor:34,
  },
  world: {
    label:'World/Dungeon',
    columns:['Ranking','Level','Class','Character','Record'],
    required:['ranking','character','record'],
    bodyFactor:32,
  },
  achievement: {
    label:'Achievement Rank',
    columns:['Ranking','Class','Level','Character','Guild','Ach. Points'],
    required:['ranking','level','character','guild','points'],
    bodyFactor:35,
  },
  guild: {
    label:'Guild Ranking',
    columns:['Ranking','Guild Name','Guild Master','Guild Score'],
    required:['ranking','guild','master','score'],
    bodyFactor:52,
  },
  mission: {
    label:'Mission Festival',
    columns:['Ranking','Guild Name','Guild Point'],
    required:['ranking','guild','name'],
    bodyFactor:48,
  },
  contribution: {
    label:'GMF Contribution Ranking',
    columns:['Ranking','Character Name','Score','Mission Count'],
    required:['ranking','character','score','mission','count'],
    bodyFactor:48,
  },
  season: {
    label:'Guild Season',
    columns:[],
    season:true,
  },
};

const I18N = {
  en: {
    ready:'Ready', analyzing:'Analyzing', noData:'No data analyzed yet.', input:'Input Screenshots', drop:'Drop screenshots here',
    pasted:'Image pasted from clipboard.', clipboardFail:'Clipboard image is not available. Use Ctrl+V or Add Images.',
    analyzeFirst:'Analyze data first.', exportDone:'Excel exported.', noRows:'No ranking rows were detected.',
    seasonReady:'Add weekly Excel files ending in _W1, _W2, _W3...', seasonMerged:'Guild Season merged.',
  },
  vi: {
    ready:'Sẵn sàng', analyzing:'Đang phân tích', noData:'Chưa có dữ liệu.', input:'Ảnh đầu vào', drop:'Thả ảnh vào đây',
    pasted:'Đã dán ảnh từ bộ nhớ tạm.', clipboardFail:'Không đọc được ảnh từ Clipboard. Hãy dùng Ctrl+V hoặc Add Images.',
    analyzeFirst:'Hãy Analyze dữ liệu trước.', exportDone:'Đã xuất Excel.', noRows:'Không nhận diện được dòng xếp hạng.',
    seasonReady:'Thêm các file Excel tuần kết thúc bằng _W1, _W2, _W3...', seasonMerged:'Đã gộp Guild Season.',
  }
};

const state = {
  active:'weekly', lang:'en', theme:'dark', worker:null, workerReady:false, analyzing:false,
  tabs:{}, seasonFiles:[], seasonRows:[], seasonColumns:[], legendActiveClass:null,
  iconTemplates:null,
};
Object.keys(PROFILES).forEach(k => state.tabs[k] = {images:[],rows:[],meta:{},warnings:[]});

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const t = k => (I18N[state.lang]||I18N.en)[k] || k;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toast(msg){
  const el=$('#toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(toast._timer); toast._timer=setTimeout(()=>el.classList.remove('show'),2400);
}
function setStatus(msg){ $('#statusText').textContent=msg; }
function setProgress(pct,label){
  const wrap=$('#progressWrap'); wrap.classList.remove('hidden');
  $('#progressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`; $('#progressLabel').textContent=label||'';
}
function hideProgress(){ $('#progressWrap').classList.add('hidden'); }
function normalizeText(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function digits(s){ const m=String(s||'').match(/\d+/g); return m ? m.join('') : ''; }
function formatNumberText(s){
  const d=digits(s); if(!d) return '';
  const n=Number(d); return Number.isFinite(n) ? n.toLocaleString('en-US') : d;
}
function nowStamp(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function monthYear(){ const d=new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}_${d.getFullYear()}`; }
function ddmmyyyyFromDateInput(v){ if(!v) return ''; const [y,m,d]=v.split('-'); return `${d}${m}${y}`; }
function safeName(s){ return String(s||'').trim().replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'') || 'Unknown'; }

function initTabs(){
  const nav=$('#tabs'); nav.innerHTML='';
  Object.entries(PROFILES).forEach(([id,p],i)=>{
    const b=document.createElement('button'); b.dataset.tab=id; b.textContent=p.label; if(i===0)b.classList.add('active');
    b.addEventListener('click',()=>switchTab(id)); nav.appendChild(b);
  });
}
function initLegendButtons(){
  const host=$('#legendClassButtons'); host.innerHTML='';
  CLASS_INFO.forEach(([code,name])=>{
    const b=document.createElement('button'); b.className='class-btn'; b.dataset.class=code;
    b.innerHTML=`<div class="class-glyph">${code}</div><small>${code}</small><span>${name}</span>`;
    b.addEventListener('click',async()=>{ state.legendActiveClass=code; await pasteFromClipboard(code); });
    host.appendChild(b);
  });
}
function switchTab(id){
  state.active=id; $$('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  $('#legendClassPanel').classList.toggle('hidden',id!=='legend');
  $('#seasonPanel').classList.toggle('hidden',id!=='season');
  $('#imageInput').disabled=id==='season'; $('#pasteBtn').disabled=id==='season'; $('#analyzeBtn').disabled=id==='season';
  $('#inputTitle').textContent=id==='season'?'Weekly Excel Files':t('input');
  $('#inputSubtitle').textContent=id==='season'?t('seasonReady'):'Drop, browse or paste images.';
  renderImages(); renderResults(); updateStatusSummary();
}

async function fileToItem(file, classCode=null){
  const url=URL.createObjectURL(file);
  return {id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,file,url,name:file.name||'clipboard.png',classCode,cache:null};
}
async function addImageFiles(files,classCode=null){
  const arr=[...files].filter(f=>f.type.startsWith('image/'));
  if(!arr.length)return;
  const bucket=state.tabs[state.active];
  for(const f of arr) bucket.images.push(await fileToItem(f,classCode || (state.active==='legend'?state.legendActiveClass:null)));
  renderImages(); updateStatusSummary();
}
function renderImages(){
  const list=$('#imageList'); list.innerHTML='';
  const bucket=state.tabs[state.active];
  if(PROFILES[state.active].season){
    $('#dropZone').classList.add('hidden'); $('#imageCount').textContent=state.seasonFiles.length;
    state.seasonFiles.forEach((x,i)=>{
      const div=document.createElement('div'); div.className='image-item';
      div.innerHTML=`<div style="display:grid;place-items:center;font-size:28px">📗</div><div><div class="name">${esc(x.file.name)}</div><div class="meta">W${x.week||'?'} • Excel</div></div><button class="remove" data-sidx="${i}">×</button>`;
      list.appendChild(div);
    });
    list.querySelectorAll('[data-sidx]').forEach(b=>b.onclick=()=>{state.seasonFiles.splice(+b.dataset.sidx,1);renderImages();renderSeasonFiles();});
    return;
  }
  $('#dropZone').classList.remove('hidden'); $('#imageCount').textContent=bucket.images.length;
  bucket.images.forEach((x,i)=>{
    const div=document.createElement('div'); div.className='image-item';
    div.innerHTML=`<img src="${x.url}" alt=""><div><div class="name">${esc(x.name)}</div><div class="meta">${x.classCode?`${x.classCode} • `:''}${Math.round(x.file.size/1024)} KB</div></div><button class="remove" data-idx="${i}">×</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll('[data-idx]').forEach(b=>b.onclick=()=>{const [x]=bucket.images.splice(+b.dataset.idx,1);if(x)URL.revokeObjectURL(x.url);renderImages();updateStatusSummary();});
}

async function pasteFromClipboard(classCode=null){
  if(state.active==='season')return;
  try{
    if(!navigator.clipboard?.read) throw new Error('Clipboard API unavailable');
    const items=await navigator.clipboard.read();
    for(const item of items){
      const type=item.types.find(x=>x.startsWith('image/'));
      if(type){ const blob=await item.getType(type); const f=new File([blob],`clipboard_${Date.now()}.png`,{type}); await addImageFiles([f],classCode); toast(t('pasted')); return; }
    }
    throw new Error('No image');
  }catch(e){ toast(t('clipboardFail')); }
}

document.addEventListener('paste', async e=>{
  if(state.active==='season')return;
  const files=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));
  if(files.length){ e.preventDefault(); await addImageFiles(files,state.active==='legend'?state.legendActiveClass:null); toast(t('pasted')); }
});

function getQuality(){
  const q=$('#qualitySelect').value;
  return q==='fast'?{maxW:1350,minW:700}:q==='accurate'?{maxW:2200,minW:1100}:{maxW:1750,minW:900};
}
async function imageFileToCanvas(file){
  const bmp=await createImageBitmap(file); const q=getQuality();
  let scale=Math.min(1,q.maxW/bmp.width); if(bmp.width*scale<q.minW) scale=q.minW/bmp.width;
  const w=Math.max(1,Math.round(bmp.width*scale)), h=Math.max(1,Math.round(bmp.height*scale));
  const c=document.createElement('canvas'); c.width=w;c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bmp,0,0,w,h);bmp.close(); return c;
}

async function ensureWorker(){
  if(state.worker)return state.worker;
  if(!window.Tesseract) throw new Error('Tesseract.js failed to load. Check internet connection.');
  setProgress(2,'Loading OCR engine…');
  state.worker=await Tesseract.createWorker('eng',1,{logger:m=>{
    if(m.status && typeof m.progress==='number') setProgress(5+m.progress*70,`${m.status} ${Math.round(m.progress*100)}%`);
  }});
  await state.worker.setParameters({preserve_interword_spaces:'1'});
  state.workerReady=true; return state.worker;
}
function parseTSV(tsv){
  const lines=String(tsv||'').split(/\r?\n/); if(lines.length<2)return[];
  const head=lines[0].split('\t'); const idx=Object.fromEntries(head.map((x,i)=>[x,i]));
  const out=[];
  for(let n=1;n<lines.length;n++){
    const a=lines[n].split('\t'); if(a.length<head.length)continue;
    const level=+a[idx.level], text=a.slice(idx.text).join('\t').trim(), conf=parseFloat(a[idx.conf]);
    if(level!==5 || !text || !Number.isFinite(conf) || conf<8)continue;
    const left=+a[idx.left],top=+a[idx.top],width=+a[idx.width],height=+a[idx.height];
    out.push({text,low:normalizeText(text),conf,left,top,width,height,cx:left+width/2,cy:top+height/2,lineKey:`${a[idx.block_num]}:${a[idx.par_num]}:${a[idx.line_num]}`});
  }
  return out;
}
function groupLines(tokens){
  const m=new Map(); for(const x of tokens){if(!m.has(x.lineKey))m.set(x.lineKey,[]);m.get(x.lineKey).push(x)}
  return [...m.values()].map(a=>a.sort((x,y)=>x.left-y.left));
}
function lineHas(line,term){return line.some(x=>x.low.includes(term))}
function detectHeader(tokens,profileId){
  const p=PROFILES[profileId], lines=groupLines(tokens), candidates=[];
  for(const line of lines){
    if(!lineHas(line,'ranking'))continue;
    if(profileId==='mission' && lineHas(line,'master'))continue;
    const hit=p.required.reduce((n,r)=>n+(lineHas(line,r)?1:0),0);
    const need=profileId==='mission'?3:p.required.length;
    if(hit<need)continue;
    const y=line.reduce((s,x)=>s+x.cy,0)/line.length;
    const width=(Math.max(...line.map(x=>x.left+x.width))-Math.min(...line.map(x=>x.left)));
    candidates.push({score:hit*100+width*.001-y*.0001,line});
  }
  if(!candidates.length)return null;
  return candidates.sort((a,b)=>b.score-a.score)[0].line;
}
function findToken(line,term,after=-Infinity){return line.find(x=>x.low.includes(term)&&x.left>after)||null}
function combinedAnchor(line,a,b){
  const x=findToken(line,a); if(!x)return null; const y=b?findToken(line,b,x.left):null;
  return y?{...x,cx:(x.cx+y.cx)/2,left:x.left,width:y.left+y.width-x.left}:{...x};
}
function anchorsFromHeader(line,profileId){
  const rank=findToken(line,'ranking'); if(!rank)return null; const A={Ranking:rank};
  if(profileId==='weekly'){
    A.Character=findToken(line,'character'); A['Treasure Score']=combinedAnchor(line,'treasure','score')||findToken(line,'score');
  }else if(profileId==='legend'){
    A.Character=findToken(line,'character'); A['Total Score']=combinedAnchor(line,'total','score');
  }else if(profileId==='world'){
    A.Character=findToken(line,'character'); A.Record=findToken(line,'record');
  }else if(profileId==='achievement'){
    A.Level=findToken(line,'level'); A.Character=findToken(line,'character'); A.Guild=findToken(line,'guild'); A['Ach. Points']=combinedAnchor(line,'ach','points')||findToken(line,'points');
  }else if(profileId==='guild'){
    A['Guild Name']=combinedAnchor(line,'guild','name');
    const master=findToken(line,'master'); if(master){const g=[...line].reverse().find(x=>x.low.includes('guild')&&x.left<master.left);A['Guild Master']=g?{...g,cx:(g.cx+master.cx)/2}:master}
    const score=findToken(line,'score'); if(score){const g=[...line].reverse().find(x=>x.low.includes('guild')&&x.left<score.left);A['Guild Score']=g?{...g,cx:(g.cx+score.cx)/2}:score}
  }else if(profileId==='mission'){
    A['Guild Name']=combinedAnchor(line,'guild','name'); A['Guild Point']=combinedAnchor(line,'guild','point')||findToken(line,'point')||findToken(line,'score');
    if(!A['Guild Point']&&A['Guild Name']){const right=line.filter(x=>x.cx>A['Guild Name'].cx+20);if(right.length)A['Guild Point']=right[right.length-1]}
  }else if(profileId==='contribution'){
    A['Character Name']=combinedAnchor(line,'character','name')||findToken(line,'character'); A.Score=findToken(line,'score'); A['Mission Count']=combinedAnchor(line,'mission','count')||findToken(line,'mission');
  }
  return A;
}
function fontHeight(line){ const a=line.map(x=>x.height).filter(x=>x>=6&&x<=60); return a.length?a.sort((x,y)=>x-y)[Math.floor(a.length/2)]:18; }
function calcBounds(A,profileId,canvasW){
  const p=PROFILES[profileId], cols=p.columns.filter(c=>c!=='Class');
  const centers=[]; for(const c of cols){if(A[c])centers.push([c,A[c].cx])}
  if(centers.length<2)return null; centers.sort((a,b)=>a[1]-b[1]);
  const bounds={};
  for(let i=0;i<centers.length;i++){
    const [name,cx]=centers[i]; const left=i===0?Math.max(0,cx-(centers[i+1][1]-cx)*.65):(centers[i-1][1]+cx)/2;
    const right=i===centers.length-1?Math.min(canvasW,cx+(cx-centers[i-1][1])*.75):(cx+centers[i+1][1])/2;
    bounds[name]=[left,right];
  }
  if(profileId==='legend'){
    const ch=A.Character,sc=A['Total Score'],rk=A.Ranking; bounds.Ranking=[Math.max(0,rk.cx-50),(rk.cx+ch.cx)/2-20]; bounds.Character=[(rk.cx+ch.cx)/2-20,(ch.cx+sc.cx)/2+8]; bounds['Total Score']=[(ch.cx+sc.cx)/2+8,canvasW];
  }
  if(profileId==='achievement'&&A.Level&&A.Character&&A.Guild&&A['Ach. Points']){
    const rk=A.Ranking,lv=A.Level,ch=A.Character,g=A.Guild,pts=A['Ach. Points'];
    bounds.Ranking=[Math.max(0,rk.cx-50),lv.cx-(lv.cx-rk.cx)*.35];
    bounds.Level=[lv.cx-35,lv.cx+(ch.cx-lv.cx)*.32];
    bounds.Character=[lv.cx+(ch.cx-lv.cx)*.32,(ch.cx+g.cx)/2];
    bounds.Guild=[(ch.cx+g.cx)/2,(g.cx+pts.cx)/2]; bounds['Ach. Points']=[(g.cx+pts.cx)/2,canvasW];
  }
  if(profileId==='world'&&A.Character&&A.Record){
    const rk=A.Ranking,ch=A.Character,rec=A.Record; bounds.Ranking=[Math.max(0,rk.cx-45),(rk.cx+ch.cx)/2-25];
    bounds.Character=[rk.cx+35,rec.cx-(rec.cx-ch.cx)*.18]; bounds.Record=[rec.cx-60,canvasW];
  }
  return bounds;
}
function textIn(tokens,left,right){return tokens.filter(x=>x.cx>=left&&x.cx<right).sort((a,b)=>a.left-b.left).map(x=>x.text).join(' ').trim()}
function cleanName(s){ return String(s||'').replace(/[|]/g,'I').replace(/\s+/g,'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9_-]+$/g,''); }
function cleanGuild(s){ return String(s||'').replace(/\s+/g,' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9_-]+$/g,'').trim(); }
function cleanMissionCount(s){ const m=String(s||'').replace(/\s/g,'').match(/(\d+)\D+(\d+)/); return m?`${m[1]}/${m[2]}`:''; }
function cleanRecord(s){ return String(s||'').trim().replace(/\s+/g,' '); }
function parseWorldMiddle(s){
  const raw=String(s||'').replace(/\s+/g,' ').trim(); const parts=raw.split(' ');
  let level='',cls='',character='';
  for(let i=0;i<parts.length;i++){ if(/^\d{2,3}$/.test(parts[i])){level=parts[i]; if(parts[i+1]&&/^(WA|BL|WI|FA|FS|FB|GL|DM|FG)$/i.test(parts[i+1])){cls=parts[i+1].toUpperCase();character=parts.slice(i+2).join('');}else character=parts.slice(i+1).join('');break;} }
  if(!character)character=parts.join(''); return {level,cls,character:cleanName(character)};
}
function detectLegendClass(tokens,forced){
  if(forced && CLASS_BY_CODE[forced])return CLASS_BY_CODE[forced];
  const whole=tokens.map(x=>x.text).join(' ').toLowerCase();
  for(const [code,name] of CLASS_INFO){if(whole.includes(name.toLowerCase()))return name}
  return 'Unknown';
}

async function loadIconTemplates(){
  if(state.iconTemplates)return state.iconTemplates;
  const img=new Image(); img.src='data:image/png;base64,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'; await img.decode();
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);
  const out={}; const w=c.width,h=c.height;
  const x0=28/255*w, step=23/255*w, y0=36/70*h, side=Math.min(22/255*w,22/70*h);
  CLASS_INFO.forEach(([code],i)=>{out[code]=getNormalizedPatch(c,x0+i*step,y0,side,side,24)}); state.iconTemplates=out; return out;
}
function getNormalizedPatch(canvas,x,y,w,h,size=24){
  const tmp=document.createElement('canvas');tmp.width=size;tmp.height=size;const ctx=tmp.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(canvas,x,y,w,h,0,0,size,size);const d=ctx.getImageData(0,0,size,size).data;const a=new Float32Array(size*size);let mean=0;
  for(let i=0,j=0;i<d.length;i+=4,j++){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];a[j]=g;mean+=g} mean/=a.length;let ss=0;for(let i=0;i<a.length;i++){a[i]-=mean;ss+=a[i]*a[i]}const sd=Math.sqrt(ss/a.length)||1;for(let i=0;i<a.length;i++)a[i]/=sd;return a;
}
function corr(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s/a.length}
async function classifyAchievementIcon(canvas,A,rowCy,rowH){
  if(!A.Ranking||!A.Level)return'Unknown'; const tpl=await loadIconTemplates(); const gap=A.Level.cx-A.Ranking.cx;
  const x=A.Ranking.cx+gap*.16, r=A.Level.cx-gap*.06; const w=Math.max(8,r-x), h=Math.max(10,rowH*1.3), y=rowCy-h/2;
  let best=['Unknown',-Infinity];
  for(const sy of [-.12,0,.12]){ const patch=getNormalizedPatch(canvas,x,y+h*sy,w,h,24); for(const [code,ref] of Object.entries(tpl)){const sc=corr(patch,ref);if(sc>best[1])best=[code,sc]} }
  return best[1]>.06?best[0]:'Unknown';
}

async function analyzeImage(item,profileId,index,total){
  if(item.cache?.[profileId])return item.cache[profileId];
  const canvas=await imageFileToCanvas(item.file),worker=await ensureWorker();
  setProgress(5+index/Math.max(1,total)*90,`OCR ${index+1}/${total}: ${item.name}`);
  const {data}=await worker.recognize(canvas,{}, {tsv:true}); const tokens=parseTSV(data.tsv||'');
  const header=detectHeader(tokens,profileId);
  if(!header){
    const warning=profileId==='mission' && tokens.some(x=>x.low.includes('contribution')) ? 'This image looks like GMF Contribution Ranking. Use that tab.' : 'Table header was not detected.';
    return {rows:[],warnings:[warning],meta:{}};
  }
  const A=anchorsFromHeader(header,profileId); if(!A)return{rows:[],warnings:['Header anchors are incomplete.'],meta:{}};
  const bounds=calcBounds(A,profileId,canvas.width); if(!bounds)return{rows:[],warnings:['Column layout was not detected.'],meta:{}};
  const fh=fontHeight(header), headerBottom=Math.max(...header.map(x=>x.top+x.height)), maxY=Math.min(canvas.height,headerBottom+Math.max(240,fh*PROFILES[profileId].bodyFactor));
  const rankX=A.Ranking.cx, rankTol=Math.max(32,fh*3.0);
  const rankTokens=tokens.filter(x=>x.cy>headerBottom+2&&x.cy<maxY&&x.cx>rankX-rankTol&&x.cx<rankX+rankTol&&/\d/.test(x.text));
  const candidates=[];
  for(const rt of rankTokens){
    const rank=digits(rt.text); if(!rank||+rank<1||+rank>999)continue;
    const tol=Math.max(8,rt.height*.72); const rowTokens=tokens.filter(x=>x.cy>rt.cy-tol&&x.cy<rt.cy+tol&&x.top>headerBottom-2&&x.cy<maxY);
    if(rowTokens.length<2)continue; candidates.push({rank:String(+rank),cy:rt.cy,h:rt.height,tokens:rowTokens});
  }
  // De-duplicate same visual row then same ranking.
  const visual=[]; for(const r of candidates.sort((a,b)=>a.cy-b.cy)){if(visual.some(v=>Math.abs(v.cy-r.cy)<Math.max(5,r.h*.5)))continue;visual.push(r)}
  const rows=[]; const meta={}; if(profileId==='legend')meta.Class=detectLegendClass(tokens,item.classCode);
  for(const rr of visual){
    const row={Ranking:rr.rank};
    if(profileId==='weekly'){
      row.Character=cleanName(textIn(rr.tokens,...bounds.Character)); row['Treasure Score']=formatNumberText(textIn(rr.tokens,...bounds['Treasure Score']));
    }else if(profileId==='legend'){
      row.Class=meta.Class; let ch=textIn(rr.tokens,...bounds.Character).replace(/\b200\b/g,' '); row.Character=cleanName(ch); row['Total Score']=formatNumberText(textIn(rr.tokens,...bounds['Total Score']));
    }else if(profileId==='world'){
      const mid=parseWorldMiddle(textIn(rr.tokens,...bounds.Character)); row.Level=mid.level;row.Class=mid.cls;row.Character=mid.character;row.Record=cleanRecord(textIn(rr.tokens,...bounds.Record));
    }else if(profileId==='achievement'){
      row.Level=digits(textIn(rr.tokens,...bounds.Level)).slice(0,3); row.Character=cleanName(textIn(rr.tokens,...bounds.Character)); row.Guild=cleanGuild(textIn(rr.tokens,...bounds.Guild)); row['Ach. Points']=formatNumberText(textIn(rr.tokens,...bounds['Ach. Points'])); row.Class=await classifyAchievementIcon(canvas,A,rr.cy,Math.max(rr.h,fh));
    }else if(profileId==='guild'){
      row['Guild Name']=cleanGuild(textIn(rr.tokens,...bounds['Guild Name'])); row['Guild Master']=cleanName(textIn(rr.tokens,...bounds['Guild Master'])); row['Guild Score']=formatNumberText(textIn(rr.tokens,...bounds['Guild Score']));
    }else if(profileId==='mission'){
      row['Guild Name']=cleanGuild(textIn(rr.tokens,...bounds['Guild Name'])); row['Guild Point']=formatNumberText(textIn(rr.tokens,...bounds['Guild Point']));
    }else if(profileId==='contribution'){
      row['Character Name']=cleanName(textIn(rr.tokens,...bounds['Character Name'])); row.Score=formatNumberText(textIn(rr.tokens,...bounds.Score)); row['Mission Count']=cleanMissionCount(textIn(rr.tokens,...bounds['Mission Count']));
    }
    const identity=row.Character||row['Character Name']||row['Guild Name']; if(identity && Object.values(row).filter(Boolean).length>=2)rows.push(row);
  }
  if(profileId==='guild')rows.splice(10);
  const result={rows,meta,warnings:rows.length?[]:['No valid rows were parsed from this image.']}; item.cache={...(item.cache||{}),[profileId]:result};return result;
}

function rowScore(row,profileId){
  const p=PROFILES[profileId]; let n=0; for(const c of p.columns){const v=row[c];if(v&&v!=='Unknown')n+=1; if(/Score|Point|Count/.test(c)&&digits(v))n+=.5}return n;
}
function mergeRows(results,profileId){
  const map=new Map(), warnings=[]; const legendMap=new Map();
  for(const res of results){warnings.push(...(res.warnings||[]));for(const r of res.rows||[]){
    const cls=profileId==='legend'?(r.Class||res.meta?.Class||'Unknown'):''; const key=profileId==='legend'?`${cls}|${r.Ranking}`:String(r.Ranking);
    const target=profileId==='legend'?legendMap:map; const old=target.get(key);
    if(!old||rowScore(r,profileId)>rowScore(old,profileId))target.set(key,{...old,...r}); else for(const [k,v] of Object.entries(r))if(!old[k]&&v)old[k]=v;
  }}
  let rows=[...(profileId==='legend'?legendMap:map).values()];
  if(profileId==='legend')rows.sort((a,b)=>(CLASS_INFO.findIndex(x=>x[1]===a.Class)-CLASS_INFO.findIndex(x=>x[1]===b.Class))||(+a.Ranking-+b.Ranking)); else rows.sort((a,b)=>+a.Ranking-+b.Ranking);
  if(profileId==='guild')rows=rows.filter(r=>+r.Ranking<=10).slice(0,10);
  return {rows,warnings};
}

async function analyzeActive(){
  if(state.analyzing||PROFILES[state.active].season)return; const bucket=state.tabs[state.active];
  if(!bucket.images.length){toast('Add or paste screenshots first.');return}
  state.analyzing=true;$('#analyzeBtn').disabled=true;setStatus(t('analyzing'));$('#warningBox').classList.add('hidden');
  try{
    const results=[]; for(let i=0;i<bucket.images.length;i++)results.push(await analyzeImage(bucket.images[i],state.active,i,bucket.images.length));
    const merged=mergeRows(results,state.active); bucket.rows=merged.rows;bucket.warnings=merged.warnings;
    if(state.active==='legend')bucket.meta={classes:[...new Set(bucket.rows.map(r=>r.Class))]};
    renderResults(); if(!bucket.rows.length)toast(t('noRows')); else toast(`${bucket.rows.length} rows extracted.`);
  }catch(e){console.error(e);bucket.warnings=[e.message||String(e)];renderResults();toast('OCR failed: '+(e.message||e));}
  finally{state.analyzing=false;$('#analyzeBtn').disabled=false;hideProgress();updateStatusSummary();}
}

function renderResults(){
  const profile=PROFILES[state.active], bucket=state.tabs[state.active];
  const columns=profile.season?state.seasonColumns:profile.columns, rows=profile.season?state.seasonRows:bucket.rows;
  const thead=$('#resultTable thead'),tbody=$('#resultTable tbody');thead.innerHTML='';tbody.innerHTML='';
  $('#resultTitle').textContent=profile.label;
  if(!columns.length||!rows.length){$('#emptyState').classList.remove('hidden');$('#metaText').textContent=t('noData');return}
  $('#emptyState').classList.add('hidden');
  const tr=document.createElement('tr');columns.forEach(c=>{const th=document.createElement('th');th.textContent=c;tr.appendChild(th)});thead.appendChild(tr);
  const q=$('#searchInput').value.trim().toLowerCase(); let shown=0;
  rows.forEach((r,ri)=>{if(q&&!Object.values(r).some(v=>String(v).toLowerCase().includes(q)))return;shown++;const tr=document.createElement('tr');columns.forEach(c=>{const td=document.createElement('td');td.textContent=r[c]??'';td.contentEditable='true';if(c==='Ranking')td.classList.add('rank-cell');td.addEventListener('blur',()=>{r[c]=td.textContent.trim()});tr.appendChild(td)});tbody.appendChild(tr)});
  const meta=state.active==='legend'&&bucket.meta.classes?.length?`Classes: ${bucket.meta.classes.join(', ')} • `:'';
  $('#metaText').textContent=`${meta}${rows.length} rows • ${shown} visible`;
  const wb=$('#warningBox'); if(bucket.warnings?.length){wb.textContent=[...new Set(bucket.warnings)].join(' • ');wb.classList.remove('hidden')}else wb.classList.add('hidden');
}
function updateStatusSummary(){
  const p=PROFILES[state.active]; if(p.season){setStatus(`${state.seasonFiles.length} Excel files`);return}
  const b=state.tabs[state.active];setStatus(`${b.images.length} images • ${b.rows.length} rows`);
}
function clearActive(){
  if(PROFILES[state.active].season){state.seasonFiles=[];state.seasonRows=[];state.seasonColumns=[];renderSeasonFiles();renderImages();renderResults();return}
  const b=state.tabs[state.active];b.images.forEach(x=>URL.revokeObjectURL(x.url));b.images=[];b.rows=[];b.meta={};b.warnings=[];renderImages();renderResults();updateStatusSummary();
}

function aoaForExport(profileId,rows,meta={}){
  const cols=PROFILES[profileId]?.columns||state.seasonColumns; const title=PROFILES[profileId]?.label||'Guild Season'; const out=[[title]];
  if(profileId==='legend'&&meta.Class)out.push(['Class',meta.Class]); else if(profileId==='world'&&meta.Title)out.push(['Selected World/Dungeon',meta.Title]); else out.push([]);
  out.push(cols); rows.forEach(r=>out.push(cols.map(c=>r[c]??''))); return out;
}
function workbookBytes(profileId,rows,meta={}){
  const ws=XLSX.utils.aoa_to_sheet(aoaForExport(profileId,rows,meta)); ws['!freeze']={xSplit:0,ySplit:3}; const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,(PROFILES[profileId]?.label||'Ranking').slice(0,31)); return XLSX.write(wb,{type:'array',bookType:'xlsx',compression:true});
}
async function exportActive(){
  if(!window.XLSX){toast('SheetJS failed to load.');return}
  if(state.active==='season')return exportSeason();
  const b=state.tabs[state.active]; if(!b.rows.length){toast(t('analyzeFirst'));return}
  if(state.active==='legend'){
    const groups={};for(const r of b.rows){(groups[r.Class||'Unknown']??=[]).push(r)};const names=Object.keys(groups);
    if(names.length>1){
      const zip=new JSZip(); for(const cls of names){const full=cls==='Unknown'?'Unknown':cls;const bytes=workbookBytes('legend',groups[cls],{Class:full});zip.file(`LegendArena_${safeName(full)}_${nowStamp()}.xlsx`,bytes)}
      const blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,`LegendArena_${nowStamp()}.zip`);toast('Legend Arena ZIP exported.');return;
    }
    const cls=names[0]||'Unknown';return downloadXlsx(workbookBytes('legend',b.rows,{Class:cls}),`LegendArena_${safeName(cls)}_${nowStamp()}.xlsx`);
  }
  let filename='';
  if(state.active==='mission')filename=`GMF_${monthYear()}.xlsx`;
  else if(state.active==='contribution'){
    const guild=prompt('Guild Name for export:','Together'); if(!guild)return; filename=`${safeName(guild)}_GMF_${monthYear()}.xlsx`;
  }else if(state.active==='weekly'){
    const d=prompt('Week end date (YYYY-MM-DD). Leave blank for timestamp:',''); const dd=ddmmyyyyFromDateInput(d);filename=dd?`Guild_Weekly_Ranking_${dd}.xlsx`:`Guild_Weekly_Ranking_${nowStamp()}.xlsx`;
  }else if(state.active==='guild')filename=`Guild_Ranking_${nowStamp()}.xlsx`;
  else if(state.active==='achievement')filename=`Archievement_Rank_${nowStamp()}.xlsx`;
  else if(state.active==='world')filename=`Dungeon_World-Dungeon_${nowStamp()}.xlsx`;
  else filename=`${safeName(PROFILES[state.active].label)}_${nowStamp()}.xlsx`;
  downloadXlsx(workbookBytes(state.active,b.rows,b.meta),filename);toast(t('exportDone'));
}
function downloadXlsx(bytes,name){downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name)}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}

async function addSeasonFiles(files){
  for(const file of [...files]){if(!/\.(xlsx|xlsm)$/i.test(file.name))continue; const m=file.name.match(/(?:^|_)W(\d+)\.(?:xlsx|xlsm)$/i); state.seasonFiles.push({file,week:m?+m[1]:null});}
  state.seasonFiles.sort((a,b)=>(a.week??999)-(b.week??999));renderSeasonFiles();renderImages();updateStatusSummary();
}
function renderSeasonFiles(){
  const host=$('#seasonFiles');host.innerHTML='';state.seasonFiles.forEach((x,i)=>{const s=document.createElement('span');s.className='season-chip';s.textContent=`${x.file.name}${x.week?` • W${x.week}`:' • invalid week name'}`;host.appendChild(s)});
}
function normHeader(x){return normalizeText(String(x||''))}
async function readWeeklyExcel(item){
  if(!item.week)throw new Error(`${item.file.name}: filename must end with _W<number>.xlsx`);
  const wb=XLSX.read(await item.file.arrayBuffer(),{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
  let h=-1,ci=-1,si=-1;for(let r=0;r<Math.min(20,aoa.length);r++){const row=aoa[r].map(normHeader);ci=row.indexOf('character');si=row.findIndex(x=>x==='treasurescore'||x==='score');if(ci>=0&&si>=0){h=r;break}}
  if(h<0)throw new Error(`${item.file.name}: Character / Treasure Score headers not found.`);
  const map=new Map();for(let r=h+1;r<aoa.length;r++){const ch=String(aoa[r][ci]||'').trim();const score=Number(String(aoa[r][si]||'').replace(/[^0-9.-]/g,''));if(ch&&Number.isFinite(score))map.set(ch,score)}return{week:item.week,map};
}
async function mergeSeason(){
  if(!state.seasonFiles.length){toast(t('seasonReady'));return}
  try{setStatus('Reading Excel…');const weeks=[];for(const f of state.seasonFiles)weeks.push(await readWeeklyExcel(f));const all=new Set();weeks.forEach(w=>w.map.forEach((_,k)=>all.add(k)));const rows=[];
    for(const ch of all){const r={Character:ch};let total=0;for(const w of weeks){const v=w.map.get(ch)||0;r[`Score W${w.week}`]=v.toLocaleString('en-US');total+=v}r['Total Score']=total.toLocaleString('en-US');rows.push(r)}
    rows.sort((a,b)=>Number(b['Total Score'].replace(/,/g,''))-Number(a['Total Score'].replace(/,/g,'')));rows.forEach((r,i)=>r.Ranking=String(i+1));state.seasonRows=rows;state.seasonColumns=['Ranking','Character',...weeks.map(w=>`Score W${w.week}`),'Total Score'];renderResults();toast(t('seasonMerged'));
  }catch(e){toast(e.message||String(e))}finally{updateStatusSummary()}
}
function exportSeason(){
  if(!state.seasonRows.length){toast(t('analyzeFirst'));return}const season=prompt('Season number:','2');if(!season)return;const year=prompt('Year:',String(new Date().getFullYear()));if(!year)return;const guild=prompt('Guild name (Together can be blank):','');
  const aoa=[['Guild Season'],[],state.seasonColumns,...state.seasonRows.map(r=>state.seasonColumns.map(c=>r[c]??''))];const ws=XLSX.utils.aoa_to_sheet(aoa);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Guild Season');const prefix=guild&&guild.trim()&&guild.trim().toLowerCase()!=='together'?`${safeName(guild)}_`:'';XLSX.writeFile(wb,`${prefix}GuildSeason_${safeName(season)}_${safeName(year)}.xlsx`,{compression:true});
}

function copyCSV(){
  const p=PROFILES[state.active],rows=p.season?state.seasonRows:state.tabs[state.active].rows,cols=p.season?state.seasonColumns:p.columns;if(!rows.length)return toast(t('analyzeFirst'));
  const q=s=>`"${String(s??'').replace(/"/g,'""')}"`;const csv=[cols.map(q).join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n');navigator.clipboard.writeText(csv).then(()=>toast('CSV copied.')).catch(()=>toast('Clipboard write failed.'));
}

function bindEvents(){
  $('#imageInput').addEventListener('change',e=>{addImageFiles(e.target.files);e.target.value=''});
  $('#pasteBtn').onclick=()=>pasteFromClipboard(state.active==='legend'?state.legendActiveClass:null);$('#analyzeBtn').onclick=analyzeActive;$('#exportBtn').onclick=exportActive;$('#clearBtn').onclick=clearActive;
  $('#searchInput').addEventListener('input',renderResults);$('#copyCsvBtn').onclick=copyCSV;
  $('#seasonInput').addEventListener('change',e=>{addSeasonFiles(e.target.files);e.target.value=''});$('#mergeSeasonBtn').onclick=mergeSeason;
  const dz=$('#dropZone');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>addImageFiles(e.dataTransfer.files));dz.addEventListener('click',()=>$('#imageInput').click());
  $('#themeBtn').onclick=()=>{document.body.classList.toggle('light');state.theme=document.body.classList.contains('light')?'light':'dark';localStorage.setItem('cabal-web-theme',state.theme)};
  $('#langBtn').onclick=()=>{state.lang=state.lang==='en'?'vi':'en';localStorage.setItem('cabal-web-lang',state.lang);renderResults();updateStatusSummary()};
}

async function boot(){
  initTabs();initLegendButtons();bindEvents();state.lang=localStorage.getItem('cabal-web-lang')||'en';state.theme=localStorage.getItem('cabal-web-theme')||'dark';if(state.theme==='light')document.body.classList.add('light');renderImages();renderResults();updateStatusSummary();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  window.addEventListener('beforeunload',()=>{Object.values(state.tabs).forEach(b=>b.images.forEach(x=>URL.revokeObjectURL(x.url)));if(state.worker)state.worker.terminate().catch(()=>{})});
}
boot();
})();