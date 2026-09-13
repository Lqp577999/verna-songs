import {GitHubCatalog} from './store.mjs';
import {parseImport,previewImport,catalogData} from '../catalog-model.mjs';
const $=q=>document.querySelector(q),key=new URLSearchParams(location.hash.slice(1)).get('key')||'';
// Strip the fragment before any request, rendering, or error handling.
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).has('key'))location.reload();});
const secure=location.protocol==='https:'||(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.protocol==='http:');
let store=null,state=null,trash=false,page=0,editId=null,busy=false,preview=null,publicationTimer=null,publicationTicket=0;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const message=e=>e instanceof Error?e.message:'操作失败，请检查输入与网络后重试。';
function render(){
 const songs=state?.songs||[],q=$('#search').value.trim().normalize('NFKC').toLowerCase(),filtered=songs.filter(s=>!!s.deletedAt===trash&&(!q||[s.id,s.title,s.artist,s.notes].join(' ').normalize('NFKC').toLowerCase().includes(q))).sort((a,b)=>a.order-b.order),lastPage=Math.max(0,Math.ceil(filtered.length/50)-1);
 page=Math.max(0,Math.min(page,lastPage));$('#rows').replaceChildren();
 for(const song of filtered.slice(page*50,(page+1)*50)){
  const row=el('article',undefined,'row'),info=el('div',undefined,'song'),actions=el('div',undefined,'row-actions');info.append(el('strong',song.title),el('small',song.artist||'歌手待补充'));if(song.notes)info.append(el('small',song.notes));
  for(const c of song.covers){const a=el('a',c.title);a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';info.append(a,el('br'));}
  if(!trash){const b=el('button','编辑');b.disabled=busy;b.onclick=()=>openEditor(song);actions.append(b);}
  const change=el('button',trash?'恢复':'移入回收站');change.disabled=busy;change.onclick=async()=>{if(!trash&&!confirm('将「'+song.title+'」移入回收站？之后可以恢复。'))return;try{await save({type:trash?'restore':'remove',ids:[song.id]});}catch(e){$('#error').hidden=false;$('#error').textContent=message(e);}};actions.append(change);
  row.append(el('span',song.id,'number'),info,el('div',[song.language,song.genre,song.type].filter(Boolean).join(' · '),'row-meta'),actions);$('#rows').append(row);
 }
 $('#count').textContent=songs.filter(s=>!s.deletedAt).length;$('#trash-count').textContent=songs.filter(s=>s.deletedAt).length;$('#results').textContent=filtered.length+' 首 · 每页 50 首';$('#empty').hidden=!state||!!filtered.length;
 $('#page').textContent=(page+1)+' / '+(lastPage+1);$('#first').disabled=$('#prev').disabled=busy||!state||page===0;$('#last').disabled=$('#next').disabled=busy||!state||page===lastPage;
 $('#active-tab').setAttribute('aria-pressed',String(!trash));$('#trash-tab').setAttribute('aria-pressed',String(trash));
 for(const id of ['add','import','backup','save','preview-import'])$('#'+id).disabled=busy||!state;
 $('#import-save').disabled=busy||!state||!preview||!preview.additions.length;$('#refresh').disabled=busy||!store;$('#check-published').disabled=!state||busy;
 for(const id of ['edit-refresh','import-refresh'])$('#'+id).disabled=busy;
 document.querySelectorAll('[data-close]').forEach(b=>b.disabled=busy);
 document.querySelectorAll('#edit-form input,#edit-form textarea,#batch,#import-file').forEach(input=>input.disabled=busy);
 for(const [id,field] of [['languages','language'],['genres','genre'],['types','type']])$('#'+id).replaceChildren(...[...new Set(songs.map(s=>s[field]).filter(Boolean))].map(v=>{const option=el('option');option.value=v;return option;}));
}
async function checkPublication(snapshot=state,ticket=++publicationTicket,attempt=0){
 clearTimeout(publicationTimer);if(!store||!snapshot)return;
 try{if(await store.isPublished(snapshot)){if(ticket===publicationTicket)$('#sync').textContent='已发布 · 第 '+snapshot.revision+' 版，公开页面已可读取。';return;}}catch{/* A failed public fetch does not undo a confirmed repository save. */}
 if(ticket!==publicationTicket)return;$('#sync').textContent='仓库已保存 · 第 '+snapshot.revision+' 版 · 尚未确认公开发布';
 if(attempt<35)publicationTimer=setTimeout(()=>checkPublication(snapshot,ticket,attempt+1),10000);
}
async function refresh(){if(busy||!store)return false;busy=true;render();try{state=await store.load();preview=null;$('#import-summary').textContent='';$('#error').hidden=true;$('#sync').textContent='已读取仓库 · 第 '+state.revision+' 版';void checkPublication();return true;}catch(e){$('#error').hidden=false;$('#error').textContent=message(e);return false;}finally{busy=false;render();}}
async function save(op){if(busy||!store||!state)return false;busy=true;render();try{state=await store.save(op,state);$('#error').hidden=true;$('#notice').textContent='已确认保存到仓库。公开网站正在发布，请看下方状态；无需重复保存。';void checkPublication();return true;}finally{busy=false;render();}}
function openEditor(song){if(busy||!state)return;editId=song?.id||null;const form=$('#edit-form');form.reset();for(const field of ['id','title','artist','language','genre','type','notes'])form.elements[field].value=song?.[field]||(field==='type'?'免费':'');form.elements.id.readOnly=!!song;form.elements.covers.value=(song?.covers||[]).map(c=>c.title+' | '+c.url).join('\n');$('#edit-title').textContent=song?'编辑歌曲':'新增歌曲';$('#edit-error').textContent='';$('#edit-refresh').hidden=true;$('#editor').showModal();form.elements.title.focus();}
function formError(prefix,e){$('#'+prefix+'-error').textContent=message(e);$('#'+prefix+'-refresh').hidden=!message(e).includes('刷新');}
$('#edit-form').onsubmit=async event=>{event.preventDefault();try{const song=Object.fromEntries(new FormData(event.target));song.covers=song.covers.split(/\r?\n/).filter(v=>v.trim()).map(line=>{const i=line.indexOf('|');if(i<1)throw Error('每条翻唱链接请填写：标题 | 网址。');return {title:line.slice(0,i).trim(),url:line.slice(i+1).trim()};});if(await save({type:editId?'edit':'add',id:editId,song}))$('#editor').close();}catch(e){formError('edit',e);}};
$('#edit-refresh').onclick=async()=>{if(await refresh()){$('#edit-error').textContent='已刷新，请核对输入后再次保存。';$('#edit-refresh').hidden=true;}};
$('#import-refresh').onclick=async()=>{if(await refresh()){$('#import-error').textContent='已刷新，请重新预览查重后保存。';$('#import-refresh').hidden=true;}};
$('#import').onclick=()=>{preview=null;$('#import-error').textContent='';$('#import-summary').textContent='';$('#import-refresh').hidden=true;$('#importer').showModal();render();};
$('#batch').oninput=()=>{preview=null;$('#import-summary').textContent='内容已改变，请重新预览查重。';render();};
$('#import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1500000)throw Error('文件超过 1.5 MB，请分批导入。');$('#batch').value=await file.text();$('#batch').dispatchEvent(new Event('input'));}catch(e){formError('import',e);}};
$('#preview-import').onclick=()=>{try{preview=previewImport(state.songs,parseImport($('#batch').value));$('#import-summary').textContent=`将新增 ${preview.additions.length} 首，跳过 ${preview.skipped} 首重复项。现有歌曲不覆盖；新增条目完整保留元数据及回收站状态。`;$('#import-error').textContent='';render();}catch(e){preview=null;formError('import',e);render();}};
$('#import-save').onclick=async()=>{if(!preview)return;try{if(await save({type:'import',songs:preview.additions})){$('#importer').close();preview=null;}}catch(e){formError('import',e);}};
$('#backup').onclick=()=>{if(!state)return;const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(catalogData(state),null,2)+'\n'],{type:'application/json'}));a.download='薇尔娜歌单备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('#notice').textContent='已导出完整备份，含回收站、编号、日期、备注与翻唱链接，不含凭证。';};
$('#search').oninput=()=>{page=0;render();};$('#first').onclick=()=>{page=0;render();};$('#last').onclick=()=>{page=Number.MAX_SAFE_INTEGER;render();};$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};$('#active-tab').onclick=()=>{trash=false;page=0;render();};$('#trash-tab').onclick=()=>{trash=true;page=0;render();};$('#add').onclick=()=>openEditor(null);$('#refresh').onclick=refresh;$('#check-published').onclick=()=>checkPublication();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)$('#'+b.dataset.close).close();});document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));window.addEventListener('pagehide',()=>{publicationTicket++;clearTimeout(publicationTimer);});
try{if(!secure)throw Error('管理页仅允许 HTTPS 或本机 localhost，请使用安全地址重新进入。');if(!key)throw Error('请从保存的私密管理链接进入。普通地址没有修改权限。');store=new GitHubCatalog({key});void refresh();}catch(e){$('#error').hidden=false;$('#error').textContent=message(e);}render();
