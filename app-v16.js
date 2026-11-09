/* Neuland v16: original-form PDF, native file share, shareable results QR */
const templateMapUrl='./template-map.json';
let templateMapPromise=null;
function getTemplateMap(){return templateMapPromise ||= fetch(templateMapUrl).then(r=>{if(!r.ok)throw Error('Originalvorlagen fehlen');return r.json()})}
function byteConcat(arr){const n=arr.reduce((a,b)=>a+b.length,0),o=new Uint8Array(n);let i=0;for(const x of arr){o.set(x,i);i+=x.length}return o}
function latinHex(s){return [...String(s).replace(/[^\x20-\xff]/g,'?')].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('')}
function bytesFromDataURL(url){return Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0))}
async function originalPdfFile(){
 const m=current(),map=(await getTemplateMap())[m.id];if(!map)throw Error('Vorlage für Wettkampf nicht gefunden');
 const pages=[];let teamIndex=0;
 for(let pi=0;pi<map.pages.length;pi++){
  const info=map.pages[pi],img= new Uint8Array(await (await fetch(`./template-${m.id}-${pi}.jpg`)).arrayBuffer());
  if(!img.length)throw Error('Vorlagenbild fehlt');
  const cmds=['q 595 0 0 842 0 0 cm /Bg Do Q','0 0 0 rg'];const sigs=[];
  function white(x,top,w=26,h=13){cmds.push(`1 1 1 rg ${x-2} ${842-top-h+2} ${w} ${h} re f 0 0 0 rg`)}
  function write(x,top,value,size=9){cmds.push(`BT /F1 ${size} Tf 1 0 0 1 ${x} ${842-top-9} Tm <${latinHex(value)}> Tj ET`)}
  for(let ti=0;ti<info.teams.length;ti++){
   const layout=info.teams[ti];
   // One original LP sheet continues onto a second page, with the preceding team's total at the top.
   let t;
   if(m.id==='31'&&pi===1&&ti===0){t=m.teams[2]}
   else{t=m.teams[teamIndex++];}
   if(!t)continue;
   const r=ranked(m,t),hasRows=layout.rows.length>0;
   for(let j=0;j<Math.min(layout.rows.length,r.all.length);j++){
    const x=r.all[j],top=layout.rows[j];
    x.vals.forEach((v,k)=>{if(v!==null&&layout.series[k]!=null)write(layout.series[k],top,String(v),9)});
    if(layout.result.length===2){
     white(layout.result[0],top);write(layout.result[0],top,x.valid?String(x.sum):'0');
     white(layout.result[1],top);write(layout.result[1],top,r.ids.has(j)?String(x.sum):'0');
    }
    if(x.ak)write(Math.min(567,(layout.result[1]||480)+54),top,'X',8);
   }
   if(layout.totals.length===2){
    const sum=r.all.filter(x=>x.valid).reduce((v,x)=>v+x.sum,0);
    white(layout.totals[0],layout.totalY);write(layout.totals[0],layout.totalY,String(sum));
    white(layout.totals[1],layout.totalY);write(layout.totals[1],layout.totalY,String(r.total));
   }
   const sig=signatureFor(m,t);
   if(sig&&layout.totalY>50){const name='Sig'+sigs.length;sigs.push({name,bytes:bytesFromDataURL(sig)});const sx=Math.min(465,Math.max(370,(layout.totals[1]||445)+12));cmds.push(`q 108 0 0 29 ${sx} ${842-layout.signY-2} cm /${name} Do Q`)}
  }
  pages.push({img,cmds:cmds.join('\n')+'\n',sigs});
 }
 const enc=new TextEncoder(),chunks=[],offsets={};let size=0;
 const add=x=>{let b=typeof x==='string'?enc.encode(x):x;chunks.push(b);size+=b.length};
 const obj=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n${body}\nendobj\n`)};
 const stream=(id,dict,bytes)=>{offsets[id]=size;add(`${id} 0 obj\n<< ${dict} /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream\nendobj\n')};
 const font=3,refs=[];let id=4;
 for(const p of pages){refs.push({page:id++,content:id++,bg:id++,sigs:p.sigs.map(s=>({...s,id:id++}))})}
 add('%PDF-1.4\n');obj(1,`<< /Type /Catalog /Pages 2 0 R >>`);obj(2,`<< /Type /Pages /Kids [${refs.map(r=>r.page+' 0 R').join(' ')}] /Count ${pages.length} >>`);obj(font,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 pages.forEach((p,i)=>{const r=refs[i];const sigRefs=r.sigs.map(s=>`/${s.name} ${s.id} 0 R`).join(' ');obj(r.page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Bg ${r.bg} 0 R ${sigRefs} >> >> /Contents ${r.content} 0 R >>`);stream(r.content,'',enc.encode(p.cmds));stream(r.bg,'/Type /XObject /Subtype /Image /Width 1042 /Height 1474 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',p.img);r.sigs.forEach(s=>stream(s.id,'/Type /XObject /Subtype /Image /Width 900 /Height 320 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',s.bytes))});
 const xref=size;add(`xref\n0 ${id}\n0000000000 65535 f \n`);for(let j=1;j<id;j++)add(String(offsets[j]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size ${id} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 const name=`Ergebniszettel_${m.date.replaceAll('.','-')}_${m.name.replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`;
 return new File([byteConcat(chunks)],name,{type:'application/pdf'});
}
// Android and iOS require navigator.share to be called from the user gesture.
// Start the asynchronous PDF preparation immediately and use the system sheet once ready.
let readyPdf=null,readyFor='',pdfBuildTimer=null;
function preparePdfV16(){
 clearTimeout(pdfBuildTimer);readyPdf=null;
 pdfBuildTimer=setTimeout(async()=>{const id=current().id;try{const f=await originalPdfFile();if(current().id===id){readyPdf=f;readyFor=id}}catch(e){console.warn('PDF-Vorbereitung',e)}},180);
}
const originalRenderV16=render;let qrViewMode=false;const originalSaveV16=save;save=function(){if(!qrViewMode)originalSaveV16()};
render=function(){originalRenderV16();if(qrViewMode)$('tables').querySelectorAll('input').forEach(x=>x.disabled=true);preparePdfV16()};
async function nativeShareV16(kind){
 const m=current(),f=readyFor===m.id?readyPdf:null;
 if(!f){preparePdfV16();alert('Das PDF wird vorbereitet. Bitte in einem Moment erneut auf Teilen tippen.');return}
 const title='Wettkampfergebnis '+m.date+' - '+teamKey(m);
 if(navigator.share&&navigator.canShare?.({files:[f]})){
  try{await navigator.share({files:[f],title});return}catch(e){if(e.name==='AbortError')return;console.warn('Teilen fehlgeschlagen',e)}
 }
 if(confirm('Direktes Teilen ist in diesem Browser nicht verfügbar. PDF jetzt herunterladen und anschließend als Dokument in '+(kind==='wa'?'WhatsApp':'E-Mail')+' anhängen?'))downloadPDF(f);
}
$('waBtn').onclick=()=>nativeShareV16('wa');$('mailBtn').onclick=()=>nativeShareV16('mail');
$('pdfBtn').onclick=async()=>{try{downloadPDF(await originalPdfFile())}catch(e){alert(e.message)}};
$('openPdfBtn').onclick=()=>{const tab=window.open('','_blank');originalPdfFile().then(f=>{const u=URL.createObjectURL(f);if(tab)tab.location.href=u;else downloadPDF(f);setTimeout(()=>URL.revokeObjectURL(u),180000)}).catch(e=>{tab?.close();alert(e.message)})};
// QR encodes only entered ring scores, never signatures or personal browser storage.
function url64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function from64(s){s=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s.padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0))}
async function gzip(bytes){if(!window.CompressionStream)throw Error('Browser unterstützt keine QR-Komprimierung');const cs=new CompressionStream('gzip'),w=cs.writable.getWriter();await w.write(bytes);await w.close();return new Uint8Array(await new Response(cs.readable).arrayBuffer())}
async function gunzip(bytes){const ds=new DecompressionStream('gzip'),w=ds.writable.getWriter();await w.write(bytes);await w.close();return new Uint8Array(await new Response(ds.readable).arrayBuffer())}
async function makeQrV16(){
 const m=current(),entries=m.teams.map(t=>t.shooters.map((s,i)=>{const v=store[key(m,t)]?.[i]||{};return [...Array(m.series)].map((_,j)=>v['s'+j]??'').concat(v.ak?1:0)}));
 const payload={v:1,id:m.id,e:entries};const zipped=await gzip(new TextEncoder().encode(JSON.stringify(payload)));
 const url=location.origin+location.pathname+'#r='+url64(zipped);
 const area=$('qrResult');area.replaceChildren();
 if(!window.LocalQRCode)throw Error('QR-Code-Bibliothek fehlt');
 const qr=new LocalQRCode(0,1);qr.addData(url);qr.make();const n=qr.getModuleCount(),canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.style.width='256px';canvas.style.height='256px';const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,512,512);const cell=480/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x)){c.fillStyle='#000';c.fillRect(Math.floor(16+x*cell),Math.floor(16+y*cell),Math.ceil(cell),Math.ceil(cell))}area.appendChild(canvas);
 $('qrLink').value=url;$('qrModal').style.display='flex';
}
$('qrBtn').onclick=()=>makeQrV16().catch(e=>alert('QR-Code: '+e.message));
$('qrClose').onclick=()=>$('qrModal').style.display='none';
$('qrCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('qrLink').value);alert('Link kopiert')}catch(e){prompt('Ergebnislink kopieren:',$('qrLink').value)}};
async function loadQrResult(){
 const hash=location.hash;if(!hash.startsWith('#r='))return;
 try{
  const payload=JSON.parse(new TextDecoder().decode(await gunzip(from64(hash.slice(3)))));
  if(payload.v!==1||!Array.isArray(payload.e))throw Error('Unbekanntes QR-Format');
  const m=matches.find(x=>x.id===payload.id);if(!m)throw Error('Wettkampf nicht gefunden');
  // Results are shown in a temporary in-memory view, never saved to localStorage.
  store=structuredClone(store);qrViewMode=true;
  m.teams.forEach((t,ti)=>{const records=payload.e[ti]||[];store[key(m,t)]={};records.slice(0,t.shooters.length).forEach((values,i)=>{const row={};for(let j=0;j<m.series;j++)row['s'+j]=String(values[j]??'');row.ak=!!values[m.series];store[key(m,t)][i]=row})});
  $('team').value=teamKey(m);refreshMatches();$('match').value=m.id;render();
  $('qrNotice').style.display='block';$('qrNotice').textContent='QR-Ergebnisansicht: Ringzahlen aus dem geteilten Link. Unterschriften sind nicht enthalten. Diese Ansicht wird nicht lokal gespeichert.';
  $('tables').querySelectorAll('input').forEach(x=>x.disabled=true);
  ['clearBtn','resetSignaturesBtn','signBtn','importBtn','exportBtn'].forEach(id=>$(id).disabled=true);
 }catch(e){alert('QR-Link konnte nicht gelesen werden: '+e.message)}
}
loadQrResult();preparePdfV16();
