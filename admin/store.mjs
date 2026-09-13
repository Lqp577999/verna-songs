import {validateCatalog,validateSong,catalogData,identity,previewImport} from '../catalog-model.mjs';
export const ENDPOINT='https://api.github.com/repos/Lqp577999/verna-songs/contents/catalog.json';
const encode=data=>{let text='';for(const b of new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'))text+=String.fromCharCode(b);return btoa(text);};
const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))));
export function applyChange(original,op){
  const songs=structuredClone(original),now=new Date().toISOString();
  const duplicate=(s,except)=>songs.some(x=>!x.deletedAt&&x.id!==except&&identity(x)===identity(s));
  if(op.type==='add'||op.type==='edit'){
    let candidate;
    if(op.type==='add'){candidate={...op.song,id:op.song.id?.trim()||crypto.randomUUID(),createdAt:now,deletedAt:null,order:Math.max(-1,...songs.map(s=>s.order))+1};if(songs.some(s=>s.id===candidate.id))throw Error('编号已存在（包括回收站），请更换编号。');}
    else{const current=songs.find(s=>s.id===op.id&&!s.deletedAt);if(!current)throw Error('歌曲不存在，请刷新后核对。');candidate={...current,...op.song,id:current.id,createdAt:current.createdAt,deletedAt:current.deletedAt,order:current.order};}
    validateSong(candidate);if(duplicate(candidate,op.type==='edit'?op.id:undefined))throw Error('已有同名、同歌手的歌曲。');
    if(op.type==='add')songs.push(candidate);else songs[songs.findIndex(s=>s.id===op.id)]=candidate;
  }else if(op.type==='remove'||op.type==='restore'){
    if(!Array.isArray(op.ids)||!op.ids.length||op.ids.some(id=>!songs.some(s=>s.id===id)))throw Error('请选择有效歌曲，或刷新后重试。');
    for(const id of new Set(op.ids)){const s=songs.find(x=>x.id===id);if(op.type==='restore'&&duplicate(s,id))throw Error('已有同名、同歌手歌曲，无法恢复。');s.deletedAt=op.type==='remove'?now:null;}
  }else if(op.type==='import'){songs.push(...previewImport(songs,op.songs).additions);}
  else throw Error('不支持的操作。');
  validateCatalog({revision:1,updatedAt:now,lastOperation:'validate-change',songs});return songs;
}
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
export class GitHubCatalog{
  #key;#needsRefresh=false;#saving=false;
  constructor({key,fetcher=(...args)=>fetch(...args),publicationUrl}={}){if(typeof key!=='string'||!key.trim()||key.length>500)throw Error('请使用有效的私密管理链接。');this.#key=key;this.fetcher=fetcher;this.publicationUrl=publicationUrl||new URL('../catalog.json',globalThis.location?.href||'https://v2na.cn/admin/').href;}
  async request(url,options,consume){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('请求超时，请检查网络后重试。')),15000);
    try{
      const response=await this.fetcher(url,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
      // fetch resolves at headers; keep the deadline until the body is consumed.
      return await consume(response);
    }finally{clearTimeout(timer);}
  }
  async api(method='GET',body){
    return this.request(ENDPOINT+(method==='GET'?`?ref=main&t=${Date.now()}`:''),{method,headers:{Authorization:`Bearer ${this.#key}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},response=>{
      if(!response.ok){const messages={401:'私密链接授权已失效，请更换令牌。',403:'仓库授权不足、已过期或请求受限，请检查令牌与 GitHub 限额。',404:'无法读取指定仓库歌单，请检查仓库授权。',409:'保存冲突：其他设备已更新，请刷新并核对，当前输入会保留。',422:'GitHub 未接受更新，请刷新并核对歌单。'};throw new ApiError(messages[response.status]||'连接 GitHub 失败，请稍后重试。',response.status);}return response.json();
    });
  }
  async read(){const file=await this.api();if(file.encoding!=='base64'||typeof file.content!=='string'||!file.sha)throw Error('云端歌单格式不正确或文件过大。');return {...validateCatalog(decode(file.content)),sha:file.sha};}
  async load(){const current=await this.read();this.#needsRefresh=false;return current;}
  async save(op,state){
    if(this.#saving)throw Error('正在保存，请稍候。');if(this.#needsRefresh)throw Error('上次保存结果尚未确认，请先刷新并核对，当前输入会保留。');
    validateCatalog(catalogData(state));if(!state.sha)throw Error('请先刷新歌单。');
    const data={revision:state.revision+1,updatedAt:new Date().toISOString(),lastOperation:crypto.randomUUID(),songs:applyChange(state.songs,op)},content=encode(data);
    if(content.length>1300000)throw Error('歌单过大，请导出备份并整理。');this.#saving=true;
    try{
      const fresh=await this.read();if(fresh.sha!==state.sha)throw new ApiError('保存冲突：其他设备已更新，请刷新并核对，当前输入会保留。',409);
      let definiteError;
      try{await this.api('PUT',{branch:'main',message:`更新薇尔娜歌单 · 第 ${data.revision} 版`,sha:state.sha,content});}catch(e){if(e instanceof ApiError&&e.status<500)definiteError=e;}
      if(definiteError)throw definiteError;
      // A response alone is insufficient: confirm this operation from a fresh read.
      try{const current=await this.read();if(current.lastOperation===data.lastOperation)return current;}catch{/* Preserve uncertain state and forbid blind retries. */}
      this.#needsRefresh=true;throw Error('连接中断或云端已变化，尚未确认这次保存结果。请刷新并核对，当前输入会保留。');
    }finally{this.#saving=false;}
  }
  async isPublished(state){
    const url=new URL(this.publicationUrl);url.searchParams.set('check',Date.now());
    return this.request(url.href,{},async response=>{
      if(!response.ok)return false;
      const current=validateCatalog(await response.json());
      return current.revision===state.revision&&current.lastOperation===state.lastOperation;
    });
  }
}
