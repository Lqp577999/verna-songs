import {PAGE_SIZE,validateCatalog,migrateCSV,filterSongs,viewCounts,formatRequest,readViewer,recordRecent,MIGRATION_DATE} from './catalog-model.mjs';
let songs=[],filtered=[],page=1,view='all',catalog=null,candidate=null,manualSong=null;
const viewerKey='verna-songbook-viewer',cacheKey='verna-songbook-catalog';
const readStorage=key=>{try{return localStorage.getItem(key);}catch{return null;}};
let viewer=readViewer(readStorage(viewerKey));
function persistViewer(){try{localStorage.setItem(viewerKey,JSON.stringify(viewer));}catch{showToast('浏览器不允许存储；收藏与最近点过仅在本次打开期间保留。');}}

let pageReferenceRows='',measuredPageWidth=0;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function closeFilters(except=null){document.querySelectorAll('.select-box.open').forEach(box=>{if(box!==except){box.classList.remove('open');box.querySelector('.filter-trigger').setAttribute('aria-expanded','false')}})}
function addOptions(id,values){const input=$(id),box=input.closest('.select-box'),menu=box.querySelector('.filter-menu'),placeholder=box.dataset.placeholder,items=['',...[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'))];menu.innerHTML=items.map((v,i)=>`<button type="button" class="filter-option${i===0?' selected':''}" role="option" aria-selected="${i===0}" data-value="${esc(v)}">${esc(v||placeholder)}</button>`).join('');menu.querySelectorAll('.filter-option').forEach(option=>option.onclick=e=>{e.stopPropagation();input.value=option.dataset.value;box.querySelector('.filter-value').textContent=option.textContent;menu.querySelectorAll('.filter-option').forEach(item=>{const active=item===option;item.classList.toggle('selected',active);item.setAttribute('aria-selected',String(active))});box.classList.remove('open');box.querySelector('.filter-trigger').setAttribute('aria-expanded','false');input.dispatchEvent(new Event('change',{bubbles:true}))})}
function apply(reset=true){filtered=filterSongs(songs,{query:$('#query').value,language:$('#language').value,genre:$('#genre').value,type:$('#type').value,view,...viewer});if(reset)page=1;render();}
function reservePageSpace(referenceRows='') {
  if (!pageReferenceRows && referenceRows) pageReferenceRows=referenceRows;
  const shell=$('.table-shell'),width=parseFloat(getComputedStyle(shell).width);
  if (!pageReferenceRows || !width || width===measuredPageWidth) return;
  // Measure the full fifty-song page at the current responsive width.
  // The temporary, inert sample never becomes a real song or a focus target.
  const sample=shell.cloneNode(false),table=shell.querySelector('table').cloneNode(false);
  sample.classList.add('page-size-probe');
  sample.setAttribute('aria-hidden','true');
  sample.inert=true;
  sample.style.width=`${width}px`;
  table.append(shell.querySelector('thead').cloneNode(true));
  const body=document.createElement('tbody');
  body.className='reveal';
  body.innerHTML=pageReferenceRows;
  table.append(body);
  sample.append(table);
  $('.catalog').append(sample);
  const height=Math.ceil(parseFloat(getComputedStyle(sample).height));
  sample.remove();
  measuredPageWidth=width;
  shell.style.height=`${height}px`;
}
function positionFilterMenu(box) {
  const trigger=box.querySelector('.filter-trigger').getBoundingClientRect();
  const catalog=$('.catalog').getBoundingClientRect();
  const gap=8,edge=12;
  const below=Math.max(0,Math.min(innerHeight-edge,catalog.bottom-edge)-trigger.bottom-gap);
  const above=Math.max(0,trigger.top-gap-Math.max(edge,catalog.top+edge));
  const upward=below<Math.min(320,box.querySelector('.filter-menu').scrollHeight) && above>below;
  box.classList.toggle('menu-up',upward);
  box.style.setProperty('--menu-available-height',`${Math.floor(upward?above:below)}px`);
}
let menuPositionFrame=0;
function scheduleFilterPosition() {
  cancelAnimationFrame(menuPositionFrame);
  menuPositionFrame=requestAnimationFrame(()=>document.querySelectorAll('.select-box.open').forEach(positionFilterMenu));
}
window.addEventListener('resize',()=>{reservePageSpace();scheduleFilterPosition()},{passive:true});
window.addEventListener('scroll',scheduleFilterPosition,{passive:true});
if ('ResizeObserver' in window) new ResizeObserver(()=>reservePageSpace()).observe($('.table-shell'));
document.fonts?.ready.then(()=>{measuredPageWidth=0;reservePageSpace()});
function render(){
  const total=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.max(1,Math.min(page,total));
  const items=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),rows=$('#rows');
  rows.innerHTML=items.length?items.map((s,i)=>`<tr style="--i:${Math.min(i,9)}">
    <td class="number">${esc(s.id)}</td>
    <td class="title"><span class="song-title" title="${esc(s.title)}">${esc(s.title)}</span>${s.covers.length?'<span class="cover-links">'+s.covers.map((c,j)=>`<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" title="${esc(c.title)}">翻唱${s.covers.length>1?j+1:''} ↗</a>`).join(' ')+'</span>':''}</td>
    <td class="artist" title="${esc(s.artist)}">${esc(s.artist)||'<span class="muted">待补充</span>'}</td>
    <td class="language">${esc(s.language)||'—'}</td>
    <td class="genre" title="${esc(s.genre)}">${esc(s.genre)||'—'}</td>
    <td class="permission"><span class="tag ${s.type==='SC'?'sc':s.type==='舰限'?'ship':'free'}">${esc(s.type)}</span></td>
    <td class="actions"><div class="song-actions"><button class="favorite" data-id="${esc(s.id)}" aria-pressed="${viewer.favorites.includes(s.id)}" aria-label="${viewer.favorites.includes(s.id)?'取消收藏':'收藏'} ${esc(s.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg></button><button class="copy" data-id="${esc(s.id)}">复制点歌</button></div></td>
  </tr>`).join(''):'<tr><td colspan="7" class="empty">没有符合条件的歌曲，请调整搜索或筛选。</td></tr>';
  reservePageSpace(items.length===PAGE_SIZE?rows.innerHTML:'');
  // Measure a complete page even if the first loaded view is a persisted favorite list.
  if(!pageReferenceRows&&songs.filter(s=>!s.deletedAt).length>=PAGE_SIZE){const savedView=view;view='all';filtered=filterSongs(songs);render();view=savedView;apply(false);return;}
  $('.table-shell').scrollTop=0;
  rows.querySelectorAll('.copy').forEach(b=>b.onclick=()=>copySong(songs.find(s=>s.id===b.dataset.id)));
  rows.querySelectorAll('.favorite').forEach(b=>b.onclick=()=>{const id=b.dataset.id;viewer.favorites=viewer.favorites.includes(id)?viewer.favorites.filter(x=>x!==id):[...viewer.favorites,id];persistViewer();apply(false);[...rows.querySelectorAll('.favorite')].find(x=>x.dataset.id===id)?.focus({preventScroll:true});});
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  const counts=viewCounts(songs,viewer);
  for(const name of ['new','favorites','recent'])$('#'+name+'-count').textContent=counts[name];
  $('#clear-recent').hidden=view!=='recent'||counts.recent===0;
  renderPages(total);$('#pageMeta').textContent=`找到 ${filtered.length} 首 · 第 ${page}/${total} 页`;$('#jump').value=page;
}

function goToPage(next){const target=Number(next)||1;document.documentElement.style.setProperty('--page-shift',target>page?'18px':target<page?'-18px':'0px');page=target;render()}
function renderPages(total){const visible=[];for(let p=1;p<=total;p++)if(p===1||p===total||Math.abs(p-page)<=1)visible.push(p);let last=0,html=`<button class="page-btn" data-p="${page-1}" ${page===1?'disabled':''}>‹</button>`;visible.forEach(p=>{if(last&&p-last>1)html+='<span>…</span>';html+=`<button class="page-btn ${p===page?'active':''}" data-p="${p}">${p}</button>`;last=p});html+=`<button class="page-btn" data-p="${page+1}" ${page===total?'disabled':''}>›</button>`;$('#pages').innerHTML=html;document.querySelectorAll('.page-btn:not(:disabled)').forEach(b=>b.onclick=()=>goToPage(b.dataset.p))}
function recordChoice(song){viewer.recent=recordRecent(viewer.recent,song.id);persistViewer();apply(false);showToast('已复制：'+formatRequest(song));}
async function copySong(song){if(!song||song.deletedAt)return;try{await navigator.clipboard.writeText(formatRequest(song));recordChoice(song);}catch{manualSong=song;$('#manual-value').value=formatRequest(song);$('#manual-copy').showModal();$('#manual-value').select();}}
function nextCandidate(){const choices=filtered.filter(s=>s.id!==candidate?.id),pool=choices.length?choices:filtered;if(!pool.length){candidate=null;showToast('当前条件下没有歌曲');return;}candidate=pool[Math.floor(Math.random()*pool.length)];$('#candidate-name').textContent=candidate.title;$('#candidate-artist').textContent=candidate.artist||'歌手待补充';$('#another').disabled=filtered.length<2;}

function showToast(text){const t=$('#toast');t.querySelector('.toast-message').textContent=text;t.classList.remove('show');requestAnimationFrame(()=>t.classList.add('show'));clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),2200)}
function makeSoundline(){const box=document.querySelector('.soundline');for(let i=0;i<72;i++){const bar=document.createElement('i');bar.style.setProperty('--h',`${8+Math.random()*38}px`);bar.style.setProperty('--d',`${-Math.random()*1.8}s`);bar.style.setProperty('--speed',`${1.2+Math.random()*1.2}s`);box.append(bar)}}
document.querySelectorAll('.filter-trigger').forEach(trigger=>trigger.onclick=e=>{e.stopPropagation();const box=trigger.closest('.select-box'),opening=!box.classList.contains('open');closeFilters(box);box.classList.toggle('open',opening);trigger.setAttribute('aria-expanded',String(opening));if(opening)positionFilterMenu(box)});document.addEventListener('click',()=>closeFilters());document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeFilters();document.activeElement?.blur()}});['#query','#language','#genre','#type'].forEach(id=>$(id).addEventListener(id==='#query'?'input':'change',e=>{if(id!=='#query'){const box=e.target.closest('.select-box');box.classList.remove('changed');requestAnimationFrame(()=>box.classList.add('changed'));setTimeout(()=>box.classList.remove('changed'),430)}apply(true)}));$('#random').onclick=()=>{nextCandidate();if(candidate)$('#candidate').showModal();};$('#go').onclick=()=>{page=Number($('#jump').value)||1;render()};$('#jump').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};makeSoundline();
function loadSongs(data){catalog=data;songs=data.songs;$('#totalCount').textContent=songs.filter(s=>!s.deletedAt).length;for(const field of ['language','genre','type']){const value=$('#'+field).value;addOptions('#'+field,songs.filter(s=>!s.deletedAt).map(s=>s[field]));const box=$('#'+field).closest('.select-box');const option=[...box.querySelectorAll('.filter-option')].find(o=>o.dataset.value===value);if(option){$('#'+field).value=value;box.querySelector('.filter-value').textContent=option.textContent;box.querySelectorAll('.filter-option').forEach(o=>{o.classList.toggle('selected',o===option);o.setAttribute('aria-selected',String(o===option));});}else{$('#'+field).value='';box.querySelector('.filter-value').textContent=box.dataset.placeholder;}}candidate=null;$('#candidate').close();apply(false);}

let lastRefresh=0,loading=false,hasCanonical=false;
async function refreshCatalog(force=false){
  if(loading||(!force&&Date.now()-lastRefresh<15000))return;loading=true;lastRefresh=Date.now();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch('./catalog.json',{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error();const data=validateCatalog(await response.json());hasCanonical=true;if(!catalog||JSON.stringify(data)!==JSON.stringify(catalog))loadSongs(data);else if(viewCounts(songs,viewer).new!==Number($('#new-count').textContent))apply(false);try{localStorage.setItem(cacheKey,JSON.stringify(data));}catch{}$('#notice').textContent='';}
  catch{if(!hasCanonical){try{const cached=validateCatalog(JSON.parse(readStorage(cacheKey)));hasCanonical=true;loadSongs(cached);}catch{if(!catalog)await loadFallback();}}$('#notice').textContent=hasCanonical?'网络暂不可用，正在显示最近一次有效歌单。':'正在显示初始离线歌单；恢复网络后会自动更新。';}
  finally{clearTimeout(timer);loading=false;}
}
async function loadFallback(){try{const response=await fetch('./songs.csv',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();loadSongs(migrateCSV(await response.text()));}catch{try{const data={revision:1,updatedAt:MIGRATION_DATE,lastOperation:'initial-offline-snapshot',songs:(window.VERNA_SONGS||[]).map((s,order)=>({...s,notes:s.notes||'',covers:[],createdAt:MIGRATION_DATE,deletedAt:null,order}))};validateCatalog(data);if(!data.songs.length)throw Error();loadSongs(data);}catch{$('#rows').innerHTML='<tr><td colspan="7" class="empty">歌单载入失败，请恢复网络后刷新。</td></tr>';$('#totalCount').textContent='0';}}}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;apply();});
$('#clear-recent').onclick=()=>{viewer.recent=[];persistViewer();apply();showToast('最近点过已清空');};
$('#another').onclick=nextCandidate;
$('#choose-candidate').onclick=()=>{$('#candidate').close();if(candidate)void copySong(songs.find(s=>s.id===candidate.id));};
$('#manual-copy-done').onclick=()=>{$('#manual-copy').close();const song=songs.find(s=>s.id===manualSong?.id&&!s.deletedAt);if(song)recordChoice(song);manualSong=null;};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
window.addEventListener('storage',e=>{if(e.key===viewerKey){viewer=readViewer(readStorage(viewerKey));apply(false);}});
window.addEventListener('focus',()=>refreshCatalog());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshCatalog();});
setInterval(()=>{if(document.visibilityState==='visible')void refreshCatalog();},60000);
void refreshCatalog(true);
