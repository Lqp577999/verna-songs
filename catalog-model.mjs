// Shared data contract. catalog.json is the sole editable source of truth.
export const PAGE_SIZE=50;
export const MIGRATION_DATE='2026-07-30T00:00:00.000Z';
const songKeys=['id','title','artist','language','genre','type','notes','covers','createdAt','deletedAt','order'];
const limits={id:100,title:200,artist:200,language:80,genre:200,type:80,notes:2000};
const normalize=s=>s.trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
const iso=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))return false;
  const time=Date.parse(value);
  if(!Number.isFinite(time))return false;
  return new Date(time).toISOString()===(value.includes('.')?value:value.replace('Z','.000Z'));
};
function exactKeys(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));}
export function validCoverURL(value){
  if(typeof value!=='string'||value.length>500)return false;
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.bilibili.com'&&!u.port&&!u.username&&!u.password&&/^\/video\/(?:BV[0-9A-Za-z]{10}|av[1-9]\d*)\/?$/.test(u.pathname)&&!u.hash;}catch{return false;}
}
export function validateSong(song){
  if(!exactKeys(song,songKeys))throw Error('歌曲含未知字段或格式不正确。');
  for(const [key,max] of Object.entries(limits))if(typeof song[key]!=='string'||song[key].length>max||(['id','title','type'].includes(key)&&!song[key].trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(song[key]))throw Error(`歌曲 ${key} 无效或超过 ${max} 字。`);
  if(!iso(song.createdAt)||!(song.deletedAt===null||iso(song.deletedAt))||!Number.isSafeInteger(song.order)||song.order<0)throw Error('歌曲日期或排序无效。');
  if(!Array.isArray(song.covers)||song.covers.length>20||song.covers.some(c=>!exactKeys(c,['title','url'])||typeof c.title!=='string'||!c.title.trim()||c.title.length>200||!validCoverURL(c.url)))throw Error('翻唱链接须为有效的 https://www.bilibili.com/video/BV… 或 av… 地址，且需填写标题。');
  return song;
}
export function validateCatalog(data){
  if(!exactKeys(data,['revision','updatedAt','lastOperation','songs'])||!Number.isSafeInteger(data.revision)||data.revision<1||!iso(data.updatedAt)||typeof data.lastOperation!=='string'||!data.lastOperation||data.lastOperation.length>150||!Array.isArray(data.songs)||data.songs.length>5000)throw Error('歌单格式不正确，请使用完整有效的备份。');
  const ids=new Set();for(const song of data.songs){validateSong(song);if(ids.has(song.id))throw Error('歌单含重复编号。');ids.add(song.id);}return data;
}
export const catalogData=state=>({revision:state.revision,updatedAt:state.updatedAt,lastOperation:state.lastOperation,songs:state.songs});
export const identity=song=>`${normalize(song.title)}\n${normalize(song.artist)}`;
export const formatRequest=song=>`点歌 ${song.title}${song.artist?`（${song.artist}）`:''}`;
export function parseDelimited(text,separator=','){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i],next=text[i+1];if(c==='"'&&quoted&&next==='"'){cell+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===separator&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('表格引号未闭合。');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
function tabularSongs(text,separator,createdAt){
  const rows=parseDelimited(text.replace(/^\uFEFF/,''),separator),header=['编号','歌名','歌手','语言','曲风','点歌类型','备注'];
  if(rows[0]?.[0]==='编号'){if(rows[0].length!==7||rows[0].some((v,i)=>v!==header[i]))throw Error('表头须为：编号、歌名、歌手、语言、曲风、点歌类型、备注。');rows.shift();}
  if(!rows.length||rows.length>5000)throw Error('请提供 1–5000 首歌曲。');
  return rows.map((row,order)=>{if(row.length!==7)throw Error(`第 ${order+1} 行须有 7 列，空白单元格也请保留。`);const [id,title,artist,language,genre,type,notes]=row;return validateSong({id:id.trim(),title,artist,language,genre,type:type||'免费',notes,covers:[],createdAt,deletedAt:null,order});});
}
export function migrateCSV(text){return validateCatalog({revision:1,updatedAt:MIGRATION_DATE,lastOperation:'migration-20260730',songs:tabularSongs(text,',',MIGRATION_DATE)});}
export function attachVerifiedCovers(catalog,matches){const data=structuredClone(validateCatalog(catalog));for(const match of matches){const song=data.songs.find(s=>s.id===match.songId);if(!song||song.title!==match.songTitle)throw Error('核实链接与现有编号、歌名不匹配。');if(!song.covers.some(c=>c.url===match.url))song.covers.push({title:match.title,url:match.url});}return validateCatalog(data);}
export function parseImport(text){
  if(typeof text!=='string'||text.length>1500000)throw Error('导入内容过大。');const value=text.trim();
  if(value.startsWith('{'))return structuredClone(validateCatalog(JSON.parse(value)).songs);
  if(value.startsWith('[')){const songs=JSON.parse(value);validateCatalog({revision:1,updatedAt:MIGRATION_DATE,lastOperation:'import',songs});return songs;}
  return tabularSongs(text,text.split(/\r?\n/,1)[0].includes('\t')?'\t':',',new Date().toISOString());
}
export function previewImport(existing,incoming){
  if(!Array.isArray(incoming)||!incoming.length||incoming.length>5000)throw Error('请提供 1–5000 首歌曲。');
  const ids=new Set(existing.map(s=>s.id)),identities=new Set(existing.map(identity)),additions=[];let skipped=0;
  for(const candidate of incoming){validateSong(candidate);if(ids.has(candidate.id)||identities.has(identity(candidate))){skipped++;continue;}ids.add(candidate.id);identities.add(identity(candidate));additions.push(structuredClone(candidate));}
  if(existing.length+additions.length>5000)throw Error('歌单超过 5000 首上限。');return {additions,skipped};
}
const WEEK=7*24*60*60*1000;
export function isNewSong(song,now=Date.now()){
  const age=now-Date.parse(song.createdAt);
  return !song.deletedAt&&age>=0&&age<WEEK;
}
export function viewCounts(songs,{favorites=[],recent=[]}={},now=Date.now()){
  const active=songs.filter(s=>!s.deletedAt),saved=new Set(favorites),visited=new Set(recent);
  return {new:active.filter(s=>isNewSong(s,now)).length,favorites:active.filter(s=>saved.has(s.id)).length,recent:active.filter(s=>visited.has(s.id)).length};
}
export function filterSongs(songs,{query='',language='',genre='',type='',view='all',favorites=[],recent=[],now=Date.now()}={}){
  const q=normalize(query),result=songs.filter(s=>!s.deletedAt&&(!q||normalize([s.id,s.title,s.artist,s.notes].join(' ')).includes(q))&&(!language||s.language===language)&&(!genre||s.genre===genre)&&(!type||s.type===type)&&(view!=='new'||isNewSong(s,now))&&(view!=='favorites'||favorites.includes(s.id))&&(view!=='recent'||recent.includes(s.id)));
  return result.sort(view==='recent'?(a,b)=>recent.indexOf(a.id)-recent.indexOf(b.id):view==='new'?(a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.order-b.order:(a,b)=>a.order-b.order);
}
export function recordRecent(recent,id){return [id,...recent.filter(v=>v!==id)].slice(0,30);}
export function readViewer(raw){try{const data=JSON.parse(raw),clean=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length<=100))]:[];return {favorites:clean(data?.favorites).slice(0,5000),recent:clean(data?.recent).slice(0,30)};}catch{return {favorites:[],recent:[]};}}
