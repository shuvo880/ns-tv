const PRIMARY='https://raw.githubusercontent.com/shuvo880/iptv/refs/heads/master/MiME.m3u';
// Set this to your deployed Cloudflare Worker URL. Example: https://ns-iptv-proxy.example.workers.dev/
// Leave empty only if all playlist/stream URLs already support browser HTTPS+CORS.
const PROXY_BASE='https://ns-iptv-proxy.shoyshobn.workers.dev/?url=';
const proxyEnabled=()=>/^https:\/\//i.test(PROXY_BASE);
const proxify=url=>proxyEnabled()?PROXY_BASE+encodeURIComponent(url):url;
const LS={playlists:'nsiptv.web.playlists',selected:'nsiptv.web.selected',channels:'nsiptv.web.channels',history:'nsiptv.web.history',favorites:'nsiptv.web.favorites'};
const $=id=>document.getElementById(id);
let playlists=JSON.parse(localStorage.getItem(LS.playlists)||'null')||[{id:'mime',name:'MiME.m3u',url:PRIMARY,channels:[]}];
let selectedId=localStorage.getItem(LS.selected)||'mime';
let channels=JSON.parse(localStorage.getItem(LS.channels)||'[]');
let currentIndex=0,current=null,hls=null,formatMode=0,networkBps=0;
const statusMap=new Map(); const favorites=new Set(JSON.parse(localStorage.getItem(LS.favorites)||'[]'));
function save(){localStorage.setItem(LS.playlists,JSON.stringify(playlists));localStorage.setItem(LS.selected,selectedId);localStorage.setItem(LS.channels,JSON.stringify(channels));localStorage.setItem(LS.favorites,JSON.stringify([...favorites]));}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2200)}
function parseM3U(text){const lines=text.split(/\r?\n/),out=[];let meta=null;for(let i=0;i<lines.length;i++){const l=lines[i].trim();if(!l)continue;if(l.startsWith('#EXTINF')){const comma=l.indexOf(',');const attrs=l.slice(8,comma<0?l.length:comma);const name=(comma>=0?l.slice(comma+1):'Channel').trim();const attr=k=>{const m=attrs.match(new RegExp(k+'="([^"]*)"','i'));return m?m[1]:''};meta={name,logo:attr('tvg-logo'),group:attr('group-title')||'Entertainment',id:attr('tvg-id')};}else if(!l.startsWith('#')){out.push({...meta||{name:'Channel',logo:'',group:'Entertainment',id:''},url:l});meta=null}}return out}
async function fetchPlaylist(p){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(proxify(p.url),{cache:'no-store',signal:controller.signal});
    if(!r.ok)throw new Error(r.status+' '+r.statusText);
    const text=await r.text();
    if(!text.trim())throw new Error('Empty playlist response');
    return parseM3U(text);
  }catch(e){
    if(e&&e.name==='AbortError')throw new Error('Playlist request timed out after 15 seconds');
    throw e;
  }finally{clearTimeout(timer)}
}
async function refreshAll(){
  const loading=$('videoLoading');
  if(loading){loading.textContent='Playlist download হচ্ছে…';loading.style.display='block'}
  toast((proxyEnabled()?'Proxy: ':'')+'Playlist download হচ্ছে…');
  let loaded=0, failed=0;
  for(const p of playlists){
    try{p.channels=await fetchPlaylist(p);loaded+=p.channels.length;}
    catch(e){failed++;p.channels=p.channels||[];console.warn(p.name,e)}
  }
  const p=playlists.find(x=>x.id===selectedId)||playlists[0];
  selectedId=p.id;channels=p.channels||[];channels.forEach((c,i)=>c.number=i+1);save();renderChannels();
  if(channels[0]&&!current)play(0);
  if(loading){loading.style.display='none'}
  toast(failed?'Playlist download শেষ: '+loaded+' channels, '+failed+' failed':'Playlist download complete: '+loaded+' channels');
}
function renderChannels(filter=''){const list=$('channelList');list.innerHTML='';const arr=channels.map((c,i)=>({...c,number:i+1})).filter(c=>c.name.toLowerCase().includes(filter.toLowerCase()));for(const c of arr){const i=c.number-1,st=statusMap.get(c.url)||'Working';const row=document.createElement('div');row.className='channel-row'+(currentIndex===i?' selected':'');row.tabIndex=0;row.setAttribute('role','button');row.innerHTML=`<img src="${esc(c.logo)||'assets/nstv_logo.png'}" onerror="this.src='assets/nstv_logo.png'"><div class="channel-main"><strong>${esc(String(c.number).padStart(3,'0'))} &nbsp; ${esc(c.name)}</strong><small>${esc(st==='Working'?'Verified cache':st)} · ${esc(c.group||'Entertainment')}</small></div><span class="state">${st==='Working'?'🟢':st==='Buffering'?'🟡':'🔴'}</span>`;row.onclick=()=>{play(i);$('channelPanel').classList.add('hidden')};row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();play(i);$('channelPanel').classList.add('hidden')}};list.appendChild(row)}
$('workingCount').textContent=[...statusMap.values()].filter(x=>x==='Working').length;$('bufferingCount').textContent=[...statusMap.values()].filter(x=>x==='Buffering').length;$('deadCount').textContent=[...statusMap.values()].filter(x=>x==='Dead').length}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function applyFormat(){const v=$('video');v.style.objectFit=['contain','cover','cover'][formatMode];if(formatMode===2)v.style.transform='scale(1.12)';else v.style.transform='scale(1)'}
function play(i){
  if(!channels[i])return;
  currentIndex=i; current=channels[i];
  showOverlay();
  $('channelNumber').textContent=String(i+1).padStart(3,'0');
  $('channelName').textContent=current.name;
  $('channelGroup').textContent=(current.group||'Bangla')+'  |  Entertainment';
  $('channelLogo').src=current.logo||'assets/nstv_logo.png';
  $('qualityScore').textContent=statusMap.get(current.url)==='Dead'?0:96;
  statusMap.set(current.url,statusMap.get(current.url)||'Working');
  $('resolution').textContent='--'; $('bitrate').textContent='--'; $('topPing').textContent='--';

  const v=$('video');
  v.pause();
  v.removeAttribute('src');
  v.load();
  v.preload='auto';
  v.playsInline=true;
  v.setAttribute('playsinline','');
  v.setAttribute('webkit-playsinline','');
  v.muted=true;
  v.autoplay=true;
  v.controls=false;

  if(hls){try{hls.destroy()}catch{} hls=null}

  const showVideoLoading=(msg='Loading video…')=>{
    toast(msg); const box=$('videoLoading'); if(box){box.textContent=msg; box.style.display='block';}
  };
  const hideVideoLoading=()=>{const box=$('videoLoading'); if(box)box.style.display='none'};
  const playWhenReady=()=>{const p=v.play(); if(p&&p.catch)p.catch(()=>{})};
  const isHls=/\.m3u8($|[?#])/i.test(current.url);
  const requestUrl=proxify(current.url);

  showVideoLoading((proxyEnabled()?'Proxy connecting to ':'Connecting to ')+current.name+'…');

  let settled=false;
  let failTimer=setTimeout(()=>{
    if(settled)return;
    statusMap.set(current.url,'Buffering'); renderChannels();
    hideVideoLoading();
    $('videoLoading').textContent='Stream did not start. Proxy or upstream stream may be unavailable.';
    $('videoLoading').style.display='block';
    toast('Stream timeout — checking proxy/upstream stream');
  },25000);
  const markReady=()=>{if(settled)return;settled=true;clearTimeout(failTimer);hideVideoLoading();statusMap.set(current.url,'Working');renderChannels();playWhenReady()};
  const markFail=(msg)=>{if(settled)return;settled=true;clearTimeout(failTimer);statusMap.set(current.url,'Dead');renderChannels();hideVideoLoading();$('videoLoading').textContent=msg;$('videoLoading').style.display='block';toast(msg)};

  // HLS playback is intentionally ALWAYS handled by hls.js through the
  // Cloudflare Worker proxy. Do not use native HLS on any browser/device.
  if(isHls && window.Hls && Hls.isSupported()){
    hls=new Hls({
      enableWorker:true,
      lowLatencyMode:false,
      maxBufferLength:30,
      maxMaxBufferLength:90,
      backBufferLength:30,
      manifestLoadingMaxRetry:3,
      levelLoadingMaxRetry:3,
      fragLoadingMaxRetry:4,
      manifestLoadingRetryDelay:1000,
      levelLoadingRetryDelay:1000,
      fragLoadingRetryDelay:1000
    });
    hls.attachMedia(v);
    hls.once(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(requestUrl));
    hls.on(Hls.Events.MANIFEST_PARSED,()=>{statusMap.set(current.url,'Working');renderChannels();});
    hls.on(Hls.Events.FRAG_LOADED,markReady);
    hls.on(Hls.Events.ERROR,(e,d)=>{
      if(!d.fatal)return;
      const detail=String(d.details||'');
      console.warn('NS IPTV hls.js error',d.type,detail,d.response||'');
      if(d.type===Hls.ErrorTypes.NETWORK_ERROR){
        // Give hls.js a chance to retry transient manifest/segment failures.
        try{hls.startLoad()}catch{}
        if(/MANIFEST_LOAD_ERROR|LEVEL_LOAD_ERROR|FRAG_LOAD_ERROR|NETWORK_ERROR/i.test(detail)){
          toast('Proxy stream request failed — retrying…');
        }
      }else if(d.type===Hls.ErrorTypes.MEDIA_ERROR){
        toast('Video decoder issue — recovering…');
        try{hls.recoverMediaError()}catch{markFail('Video decoder could not recover')}
      }else{
        markFail('Stream unavailable — hls.js could not decode it');
      }
    });
  }else if(isHls){
    markFail('hls.js is unavailable — HLS playback cannot start');
  }else{
    // Non-HLS media still goes through the Cloudflare Worker proxy.
    v.src=requestUrl;
    v.load();
    v.addEventListener('canplay',markReady,{once:true});
    v.addEventListener('loadeddata',markReady,{once:true});
    v.addEventListener('error',()=>markFail('Proxied video stream failed'),{once:true});
  }

  applyFormat(); renderChannels();
}
function audioDialog(){const d=modal('Audio Tracks','<div id="audioTracks">Loading tracks…</div><div class="controls"><button class="primary" onclick="closeModal()">Close</button></div>');const box=d.querySelector('#audioTracks');setTimeout(()=>{if(!hls||!hls.audioTracks?.length){box.innerHTML='<p>Audio 1</p><small>This stream exposes one audio track to the browser.</small>';return}box.innerHTML=hls.audioTracks.map((t,i)=>`<div class="playlist-item"><b>${esc(t.name||t.lang||'Audio '+(i+1))}</b><button onclick="selectAudio(${i})">Select</button></div>`).join('')},100)}
function selectAudio(i){if(hls)hls.audioTrack=i;closeModal();toast('Audio track '+(i+1)+' selected')}
function formatDialog(){modal('Video / Format',`<label><input type="radio" name="fmt" ${formatMode===0?'checked':''} onchange="setFormat(0)"> Fit Screen</label><br><br><label><input type="radio" name="fmt" ${formatMode===1?'checked':''} onchange="setFormat(1)"> Fill Screen</label><br><br><label><input type="radio" name="fmt" ${formatMode===2?'checked':''} onchange="setFormat(2)"> Zoom / Crop</label><div class="controls"><button onclick="closeModal()">Close</button></div>`)}
function setFormat(m){formatMode=m;applyFormat();closeModal();toast(['Fit Screen','Fill Screen','Zoom / Crop'][m])}
function manualDialog(){modal('Manual Playlist Add',`<label>M3U / M3U8 URL</label><input id="newUrl" placeholder="https://example.com/list.m3u"><button class="primary" onclick="addPlaylist()">Add Playlist</button><h3>Manual Playlists (${playlists.length-1})</h3><div>${playlists.filter(p=>p.id!=='mime').map(p=>`<div class="playlist-item"><input type="radio" name="setp" ${p.id===selectedId?'checked':''} onchange="setPlaylist('${p.id}')"><span>${esc(p.name)} <small>(${p.channels?.length||0} channels)</small></span><button onclick="removePlaylist('${p.id}')">×</button></div>`).join('')}</div><div class="controls"><button onclick="closeModal()">Close</button></div>`)}
async function addPlaylist(){const u=$('newUrl').value.trim();if(!u)return;if(playlists.some(p=>p.url===u)){toast('Playlist already added');return}const p={id:'p'+Date.now(),name:'Manual Playlist '+(playlists.length),url:u,channels:[]};playlists.push(p);save();try{p.channels=await fetchPlaylist(p);toast('Added '+p.channels.length+' channels')}catch(e){toast('Added; refresh/check later')}save();manualDialog()}
function setPlaylist(id){selectedId=id;save();const p=playlists.find(x=>x.id===id);channels=p?.channels||[];channels.forEach((c,i)=>c.number=i+1);save();renderChannels();closeModal();toast('Playlist set: '+p.name)}
function removePlaylist(id){playlists=playlists.filter(p=>p.id!==id);if(selectedId===id)selectedId='mime';save();manualDialog()}
function playlistDialog(){modal('Playlist Set',`<div>${playlists.map(p=>`<div class="playlist-item"><input type="radio" name="setp2" ${p.id===selectedId?'checked':''} onchange="setPlaylist('${p.id}')"><span><b>${esc(p.name)}</b><br><small>${p.channels?.length||0} channels</small></span></div>`).join('')}</div><div class="controls"><button onclick="closeModal()">Close</button></div>`,'dark')}
function settingsDialog(){modal('Settings',`<div class="check-row">Default Playlist: <b>MiME.m3u</b></div><div class="check-row">Selected Playlist: <b>${esc(playlists.find(p=>p.id===selectedId)?.name||'MiME.m3u')}</b></div><div class="check-row">Browser HLS Engine: <b>${window.Hls?'Cloudflare Proxy + hls.js':'hls.js unavailable'}</b></div><div class="controls"><button onclick="refreshAll();closeModal()">Refresh Now</button><button onclick="closeModal()">Close</button></div>`,'dark')}
function epgDialog(){modal('EPG',`<h3>${esc(current?.name||'Channel')}</h3><div class="playlist-item"><b>10:30 - 11:30</b><span>Current Program</span></div><div class="playlist-item"><b>11:30 - 12:30</b><span>Next Program</span></div><small>EPG source: XML / XMLTV can be connected in the web backend.</small><div class="controls"><button onclick="closeModal()">Close</button></div>`,'dark')}
function modal(title,html,theme=''){const root=$('modalRoot');root.innerHTML=`<div class="modal"><div class="dialog ${theme}"><button class="close" onclick="closeModal()">×</button><h2>${title}</h2>${html}</div></div>`;return root.querySelector('.dialog')}
function closeModal(){$('modalRoot').innerHTML=''}
function updateClock(){const d=new Date();$('clock').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});$('date').textContent=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')}
setInterval(updateClock,1000);updateClock();
setInterval(()=>{networkBps=4000000+Math.random()*5000000;$('network').textContent=(networkBps/1e6).toFixed(1)+' Mbps';$('topNet').textContent=(networkBps/1e6).toFixed(1)+' Mbps'},2000);
$('channelSearch').oninput=e=>renderChannels(e.target.value);$('railSearch').oninput=e=>renderChannels(e.target.value);$('audioBtn').onclick=audioDialog;$('formatBtn').onclick=formatDialog;$('epgBtn').onclick=epgDialog;$('manualBtn').onclick=manualDialog;$('refreshBtn').onclick=refreshAll;$('settingsBtn').onclick=settingsDialog;$('favoriteBtn').onclick=()=>{if(!current)return;favorites.has(current.url)?favorites.delete(current.url):favorites.add(current.url);save();toast(favorites.has(current.url)?'Added to Favorites':'Removed from Favorites')};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).classList.add('hidden'));
$('video').addEventListener('loadedmetadata',()=>{
  const w=$('video').videoWidth,h=$('video').videoHeight;
  $('resolution').textContent=w+'x'+h;
  const short=Math.max(w,h),badge=short>=2000?'4K':short>=1400?'2K':short>=1000?'FHD':short>=650?'HD':'SD';
  $('hdBadge').textContent=badge;
});$('video').addEventListener('progress',()=>{try{const b=$('video').buffered;if(b.length)$('bitrate').textContent='Adaptive'}catch{}});
function ensureDefaultPlaylist(){let mime=playlists.find(p=>p.id==='mime');if(!mime){mime={id:'mime',name:'MiME.m3u',url:PRIMARY,channels:[]};playlists.unshift(mime)}else{mime.name='MiME.m3u';mime.url=PRIMARY}if(!playlists.some(p=>p.id===selectedId))selectedId='mime';save()}
function setPanelVisible(id, visible){const el=$(id);if(!el)return;el.classList.toggle('hidden',!visible);el.setAttribute('aria-hidden',visible?'false':'true');}
function isPanelOpen(id){const el=$(id);return !!el && !el.classList.contains('hidden')}
let overlayTimer=null;
function showOverlay(){
  const overlay=$('bottomOverlay'); if(!overlay)return;
  overlay.classList.remove('overlay-hidden');
  clearTimeout(overlayTimer);
  overlayTimer=setTimeout(()=>overlay.classList.add('overlay-hidden'),5000);
}
function wireOverlayAutoHide(){
  const overlay=$('bottomOverlay'); if(!overlay)return;
  overlay.addEventListener('click',showOverlay);
  document.addEventListener('keydown',showOverlay,{passive:true});
  showOverlay();
}
function wirePanelSwipes(){
  const app=$('app'); if(!app)return;
  let sx=0,sy=0,pointerId=null,tracking=false,swiped=false;
  const EDGE_RATIO=0.06, THRESHOLD=45;
  const edgeZone=()=>Math.max(24,Math.round(window.innerWidth*EDGE_RATIO));
  const point=e=>({x:Number(e.clientX)||0,y:Number(e.clientY)||0});
  const begin=e=>{
    if(e.pointerType==='mouse' && e.button!==0)return;
    if(pointerId!==null)return;
    const p=point(e); sx=p.x; sy=p.y; pointerId=e.pointerId; tracking=false; swiped=false;
    try{app.setPointerCapture(pointerId)}catch{}
  };
  const move=e=>{
    if(pointerId!==e.pointerId)return;
    const p=point(e),dx=p.x-sx,dy=p.y-sy;
    if(Math.abs(dx)>10 || Math.abs(dy)>10)tracking=true;
    if(tracking && e.cancelable)e.preventDefault();
  };
  const finish=e=>{
    if(pointerId!==e.pointerId)return;
    const p=point(e),dx=p.x-sx,dy=p.y-sy;
    const horizontal=Math.abs(dx)>=THRESHOLD && Math.abs(dx)>Math.abs(dy)*1.15;
    const vertical=Math.abs(dy)>=THRESHOLD && Math.abs(dy)>Math.abs(dx)*1.15;
    swiped=horizontal||vertical;
    pointerId=null;
    try{app.releasePointerCapture(e.pointerId)}catch{}
    if(!horizontal && !vertical)return;

    const leftOpen=isPanelOpen('channelPanel'), rightOpen=isPanelOpen('actionRail');

    if(vertical && leftOpen){
      const list=$('channelList');
      if(list)list.scrollTop-=dy;
      if(e.cancelable)e.preventDefault();
      return;
    }

    if(vertical && !leftOpen && !rightOpen && channels.length){
      const nextIndex=dy<0 ? currentIndex+1 : currentIndex-1;
      if(nextIndex>=0 && nextIndex<channels.length)play(nextIndex);
      else toast(dy<0?'Last channel':'First channel');
      if(e.cancelable)e.preventDefault();
      return;
    }
    if(!horizontal)return;

    if(!leftOpen && !rightOpen && sx<=edgeZone() && dx>0){
      setPanelVisible('channelPanel',true); return;
    }
    if(leftOpen && dx<0){
      setPanelVisible('channelPanel',false); return;
    }
    if(!leftOpen && !rightOpen && sx>=window.innerWidth-edgeZone() && dx<0){
      setPanelVisible('actionRail',true); return;
    }
    if(rightOpen && dx>0){
      setPanelVisible('actionRail',false); return;
    }
  };
  const cancel=e=>{
    if(pointerId===e.pointerId){pointerId=null;tracking=false;swiped=false;try{app.releasePointerCapture(e.pointerId)}catch{}}
  };

  // Use one Pointer Events path for Android TV touch/remote emulation and desktop mouse.
  // Normal taps are never cancelled; preventDefault is used only after a real swipe begins.
  app.addEventListener('pointerdown',begin,{capture:true,passive:false});
  app.addEventListener('pointermove',move,{capture:true,passive:false});
  app.addEventListener('pointerup',finish,{capture:true,passive:false});
  app.addEventListener('pointercancel',cancel,{capture:true,passive:false});

  // Prevent the click generated after a completed swipe, while preserving ordinary taps.
  app.addEventListener('click',e=>{
    if(swiped){e.preventDefault();e.stopPropagation();swiped=false;}
  },true);

  window.addEventListener('keydown',e=>{
    if($('modalRoot')?.children.length)return;
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(tag==='input' || tag==='textarea' || tag==='select')return;
    if(e.key==='ArrowUp'){
      e.preventDefault(); if(channels.length)play(Math.max(0,currentIndex-1));
    }else if(e.key==='ArrowDown'){
      e.preventDefault(); if(channels.length)play(Math.min(channels.length-1,currentIndex+1));
    }else if(e.key==='ArrowLeft'){
      e.preventDefault();
      if(isPanelOpen('actionRail'))setPanelVisible('actionRail',false);
      else setPanelVisible('channelPanel',true);
    }else if(e.key==='ArrowRight'){
      e.preventDefault();
      if(isPanelOpen('channelPanel'))setPanelVisible('channelPanel',false);
      else setPanelVisible('actionRail',true);
    }else if(e.key==='Enter'){
      e.preventDefault(); if(channels.length)play(currentIndex);
    }else if(e.key==='Escape'){
      e.preventDefault(); setPanelVisible('channelPanel',false); setPanelVisible('actionRail',false); closeModal();
    }
  });

  // A tap on video unmutes playback, but never blocks button/channel clicks.
  $('video').addEventListener('click',()=>{
    const v=$('video');
    if(v&&v.muted){v.muted=false;const p=v.play();if(p&&p.catch)p.catch(()=>{v.muted=true});}
  });
}
ensureDefaultPlaylist();
const selectedPlaylist=playlists.find(p=>p.id===selectedId)||playlists[0];channels=selectedPlaylist.channels||[];channels.forEach((c,i)=>c.number=i+1);renderChannels();
if(channels.length)play(0);else refreshAll().catch(e=>toast('Refresh failed: '+e.message));
wirePanelSwipes();
wireOverlayAutoHide();
