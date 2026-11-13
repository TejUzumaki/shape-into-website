/* V2H Static Core — browser-native persistence. No Node, API server or build step. */
'use strict';
const V2H = (() => {
  const DB_KEY='v2h_static_db_v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(DB_KEY))||{projects:[],collections:[],records:{},sites:[]}}catch(e){return {projects:[],collections:[],records:{},sites:[]}}};
  const write=db=>{try{localStorage.setItem(DB_KEY,JSON.stringify(db));return true}catch(e){throw new Error('Browser storage is full. Export a backup and remove large images or old projects.')}};
  const uid=p=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,18):Math.random().toString(36).slice(2,14));
  const now=()=>Date.now();
  const slugify=s=>String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'untitled';
  const state={token:'local-workspace',user:{id:'owner-local',name:'Local workspace',email:'local@v2h.browser'}};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtDate=ts=>ts?new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
  function summary(c,db){return {...c,recordCount:(db.records[c.id]||[]).length}}
  function download(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
  function crc32(bytes){let c=~0;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (~c)>>>0}
  function zip(files){
    const enc=new TextEncoder(),local=[],central=[];let offset=0;
    for(const [name,value] of Object.entries(files)){
      const n=enc.encode(name);let data;
      if(value instanceof Uint8Array)data=value;
      else if(typeof value==='string'&&value.startsWith('data:')){const b=value.split(',')[1]||'';const raw=atob(b);data=Uint8Array.from(raw,ch=>ch.charCodeAt(0))}
      else data=enc.encode(String(value));
      const crc=crc32(data),lh=new Uint8Array(30+n.length),lv=new DataView(lh.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,n.length,true);lh.set(n,30);
      local.push(lh,data);
      const ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);ch.set(n,46);central.push(ch);offset+=lh.length+data.length;
    }
    const centralSize=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }
  function downloadZip(files,name){download(name||'v2h-export.zip',zip(files))}
  async function api(method,path,body){
    method=method.toUpperCase();const u=new URL(path,location.href),p=u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);const db=read();
    const ok=x=>x;const bad=m=>{throw new Error(m)};
    if(p[0]!=='api')bad('Unknown local operation');
    if(p[1]==='auth')return {token:'local-workspace',user:state.user};
    if(p[1]==='projects'){
      const readProjects=()=>{try{return JSON.parse(localStorage.getItem('v2h_projects')||'[]')}catch(e){return []}};
      const writeProjects=list=>{try{localStorage.setItem('v2h_projects',JSON.stringify(list))}catch(e){bad('Browser storage is full. Export a backup and reduce project size.')}};
      if(p.length===2&&method==='GET')return {projects:readProjects().map(x=>({id:String(x.id),name:x.name,thumb:x.thumb||'',createdAt:x.date||now(),updatedAt:x.date||now()}))};
      if(p.length===2&&method==='POST'){const list=readProjects();const x={id:uid('prj'),name:String(body?.name||'Untitled').slice(0,80),state:body?.state||null,thumb:body?.thumb||'',date:now()};list.push(x);writeProjects(list);return {project:{...x,createdAt:x.date,updatedAt:x.date}}}
      const list=readProjects(),x=list.find(v=>String(v.id)===String(p[2]));if(!x)bad('Project not found');
      if(p.length===3&&method==='GET')return {project:{...x,createdAt:x.date,updatedAt:x.date}};
      if(p.length===3&&method==='PUT'){if(body.name!==undefined)x.name=String(body.name).slice(0,80);if(body.state!==undefined)x.state=body.state;if(body.thumb!==undefined)x.thumb=body.thumb;x.date=now();writeProjects(list);return {project:{...x,updatedAt:x.date}}}
      if(p.length===3&&method==='DELETE'){writeProjects(list.filter(v=>String(v.id)!==String(x.id)));return {ok:true}}
    }
    if(p[1]==='collections'){
      if(p.length===2&&method==='GET')return {collections:db.collections.map(c=>summary(c,db))};
      if(p.length===2&&method==='POST'){const name=String(body?.name||'Untitled App');let slug=slugify(body?.slug||name);if(db.collections.some(c=>c.slug===slug))slug+='-'+Math.random().toString(36).slice(2,5);const c={id:uid('col'),ownerId:'owner-local',name:name.slice(0,60),slug,icon:body?.icon||'fa-database',color:body?.color||'#ffffff',fields:Array.isArray(body?.fields)?body.fields:[],views:body?.views||{primaryField:null,listFields:[],imageField:null,layout:'cards'},public:!!body?.public,createdAt:now(),updatedAt:now()};db.collections.push(c);db.records[c.id]=[];write(db);return {collection:summary(c,db)}}
      const c=db.collections.find(x=>x.id===p[2]||x.slug===p[2]);if(!c)bad('App not found');
      if(p.length===3&&method==='GET')return {collection:summary(c,db)};
      if(p.length===3&&method==='PUT'){for(const k of ['name','icon','color','fields','views','public'])if(body[k]!==undefined)c[k]=body[k];if(body.slug!==undefined)c.slug=slugify(body.slug);c.updatedAt=now();write(db);return {collection:summary(c,db)}}
      if(p.length===3&&method==='DELETE'){db.collections=db.collections.filter(x=>x.id!==c.id);delete db.records[c.id];write(db);return {ok:true}}
      if(p[3]==='records'){
        const rows=db.records[c.id]||(db.records[c.id]=[]);
        if(p.length===4&&method==='GET'){let out=rows.slice();const q=(u.searchParams.get('search')||'').toLowerCase();if(q)out=out.filter(r=>c.fields.some(f=>String(r[f.key]||'').toLowerCase().includes(q)));return {records:out.slice(0,500),total:out.length}}
        if(p.length===4&&method==='POST'){const r={id:uid('rec'),createdAt:now(),updatedAt:now()};c.fields.forEach(f=>r[f.key]=body[f.key]??(f.type==='boolean'?false:''));rows.push(r);c.updatedAt=now();write(db);return {record:r}}
        const r=rows.find(x=>x.id===p[4]);if(!r)bad('Record not found');
        if(p.length===5&&method==='PUT'){c.fields.forEach(f=>{if(body[f.key]!==undefined)r[f.key]=body[f.key]});r.updatedAt=now();write(db);return {record:r}}
        if(p.length===5&&method==='DELETE'){db.records[c.id]=rows.filter(x=>x.id!==r.id);write(db);return {ok:true}}
      }
    }
    if(p[1]==='public'&&p[2]==='collections'){
      const c=db.collections.find(x=>x.id===p[3]||x.slug===p[3]);if(!c)bad('App not found');
      if(p[4]==='records'){let rows=db.records[c.id]||[];const q=(u.searchParams.get('search')||'').toLowerCase();if(q)rows=rows.filter(r=>c.fields.some(f=>String(r[f.key]||'').toLowerCase().includes(q)));return {records:rows,total:rows.length}}
      return {collection:{name:c.name,slug:c.slug,icon:c.icon,color:c.color,fields:c.fields,views:c.views}};
    }
    if(p[1]==='sites'&&method==='GET')return {sites:db.sites||[]};
    if(p[1]==='publish'&&method==='POST')return {url:'#static-export-ready'};
    bad('Unsupported local operation: '+method+' '+path);
  }
  function signIn(token,user){state.token=token;state.user=user||state.user}
  function signOut(){toast('This is a local-only workspace. No account session exists.','')}
  function isAuthed(){return true}
  function toast(msg,type){let root=document.querySelector('.toast-root');if(!root){root=document.createElement('div');root.className='toast-root';document.body.appendChild(root)}const t=document.createElement('div');t.className='toast '+(type==='ok'?'ok':type==='er'?'er':'');t.textContent=msg;root.appendChild(t);setTimeout(()=>t.remove(),3000)}
  let promptCb=null;
  function prompt(title,value,cb){let wrap=document.getElementById('v2hPrompt');if(!wrap){wrap=document.createElement('div');wrap.id='v2hPrompt';wrap.className='mb';wrap.innerHTML='<div class="mx" style="min-width:320px"><h3 id="v2hPromptTitle" style="margin-bottom:12px"></h3><input id="v2hPromptInput" class="pi" style="margin-bottom:14px"><div style="display:flex;justify-content:flex-end;gap:8px"><button id="v2hPromptCancel" class="bg">Cancel</button><button id="v2hPromptOk" class="ba">Create</button></div></div>';document.body.appendChild(wrap);wrap.querySelector('#v2hPromptCancel').onclick=()=>wrap.style.display='none';wrap.querySelector('#v2hPromptOk').onclick=()=>{const v=wrap.querySelector('input').value.trim();wrap.style.display='none';if(v&&promptCb)promptCb(v)};wrap.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter')wrap.querySelector('#v2hPromptOk').click()})}promptCb=cb;wrap.querySelector('h3').textContent=title;wrap.querySelector('input').value=value||'';wrap.style.display='flex';setTimeout(()=>wrap.querySelector('input').focus(),30)}
  function confirmDialog(title,cb){if(confirm(title+'\nThis action cannot be undone.'))cb()}
  function exportBackup(){const d=read();d.projects=(()=>{try{return JSON.parse(localStorage.getItem('v2h_projects')||'[]')}catch(e){return []}})();download('v2h-workspace-backup.json',new Blob([JSON.stringify(d,null,2)],{type:'application/json'}))}
  function importBackup(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d||!Array.isArray(d.projects)||!Array.isArray(d.collections))throw Error('Invalid V2H backup');write(d);if(Array.isArray(d.projects))localStorage.setItem('v2h_projects',JSON.stringify(d.projects));toast('Workspace restored. Reloading…','ok');setTimeout(()=>location.reload(),700)}catch(e){toast(e.message,'er')}};r.readAsText(file)}
  return {api,signIn,signOut,isAuthed,state,slugify,esc,fmtDate,toast,prompt,confirmDialog,downloadZip,exportBackup,importBackup};
})();
