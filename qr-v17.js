/* Neuland QR sharing v17; independent of PDF layout. */
(()=>{
 const $=id=>document.getElementById(id);
 const show=(message)=>{$('qrModal').style.display='flex';$('qrStatus').textContent=message;};
 const toBase64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
 const fromBase64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
 async function pack(value){
   const bytes=new TextEncoder().encode(JSON.stringify(value));
   if(!('CompressionStream' in window))return 'j'+toBase64(bytes);
   const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
   return 'z'+toBase64(new Uint8Array(compressed));
 }
 async function unpack(data){
   const bytes=fromBase64(data.slice(1));
   if(data[0]==='j')return JSON.parse(new TextDecoder().decode(bytes));
   if(data[0]!=='z'||!('DecompressionStream' in window))throw Error('QR-Datenformat wird nicht unterstützt');
   const decompressed=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
   return JSON.parse(new TextDecoder().decode(decompressed));
 }
 async function create(){
   const m=current();show('QR-Code wird erzeugt …');$('qrResult').replaceChildren();$('qrLink').value='';
   try{
     const e=m.teams.map(t=>t.shooters.map((sh,i)=>{const v=store[key(m,t)]?.[i]||{};return Array.from({length:m.series},(_,j)=>v['s'+j]??'').concat(v.ak?1:0)}));
     const url=location.origin+location.pathname+'#r='+await pack({v:1,id:m.id,e});
     if(!window.LocalQRCode)throw Error('QR-Bibliothek konnte nicht geladen werden');
     const qr=new LocalQRCode(0,1);qr.addData(url);qr.make();
     const n=qr.getModuleCount(),quiet=4,cell=6;
     const canvas=document.createElement('canvas');canvas.width=canvas.height=(n+quiet*2)*cell;
     canvas.style.width='min(100%,290px)';canvas.style.height='auto';
     const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';
     for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))ctx.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);
     $('qrResult').append(canvas);$('qrLink').value=url;
     $('qrStatus').textContent='QR-Code fertig. Mit der Kamera scannen oder Link kopieren.';
   }catch(err){$('qrStatus').textContent='QR-Code konnte nicht erzeugt werden: '+err.message;console.error(err)}
 }
 $('qrBtn').addEventListener('click',create);
 $('qrClose').addEventListener('click',()=>{$('qrModal').style.display='none'});
 $('qrCopy').addEventListener('click',async()=>{const link=$('qrLink').value;if(!link)return;try{await navigator.clipboard.writeText(link);alert('Link kopiert')}catch(e){prompt('Ergebnislink kopieren:',link)}});
 async function openResult(){
   if(!location.hash.startsWith('#r='))return;
   try{
     const data=await unpack(location.hash.slice(3));
     if(data.v!==1||!Array.isArray(data.e))throw Error('Ungültige Daten');
     const m=matches.find(x=>x.id===String(data.id));if(!m)throw Error('Wettkampf nicht gefunden');
     // A QR link is a read-only snapshot, not a write to saved results.
     store=JSON.parse(JSON.stringify(store));
     m.teams.forEach((t,ti)=>{const list=data.e[ti]||[];store[key(m,t)]={};list.slice(0,t.shooters.length).forEach((vals,i)=>{const row={};for(let j=0;j<m.series;j++)row['s'+j]=String(vals[j]??'');row.ak=!!vals[m.series];store[key(m,t)][i]=row})});
     $('team').value=teamKey(m);refreshMatches();$('match').value=m.id;render();
     document.querySelectorAll('#tables input').forEach(el=>el.disabled=true);
     ['clearBtn','resetSignaturesBtn','signBtn','importBtn','exportBtn','qrBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=true});
     document.querySelectorAll('[data-signteam]').forEach(el=>el.disabled=true);
     const info=document.createElement('p');info.style.cssText='background:#fff3cd;padding:12px;border-radius:8px;font-weight:600';info.textContent='Geteilte Ergebnisansicht (nur lesen): Ringzahlen aus dem QR-Code. Unterschriften werden nicht übertragen. Deine gespeicherten Ergebnisse bleiben unverändert.';
     document.querySelector('.shell header').after(info);
     $('team').disabled=true;$('match').disabled=true;
   }catch(err){alert('QR-Link konnte nicht geöffnet werden: '+err.message)}
 }
 openResult();
})();
