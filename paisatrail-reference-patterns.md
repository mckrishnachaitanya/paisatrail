# PaisaTrail — Reusable Patterns (extracted from the Vault password-manager PWA)

This is a trimmed-down reference pulled from the original `index.html` (≈5,000 lines).
Paste this file into future chats instead of the full app — it has just the
plumbing that transfers directly to PaisaTrail: screens, PIN lock, idle
auto-lock, step-up re-auth, biometric (WebAuthn), theme toggle, toasts,
swipe-to-delete, and the IndexedDB file-attachment layer.

Anything *not* in here (password health checks, card/Aadhaar formatting,
expiry alerts, the per-type custom fields) was password-manager-specific —
PaisaTrail's equivalents (recurring-expense reminders, category icon/color,
budgets) get written fresh, but on top of this same architecture.

---

## 1. App shell — screens & navigation

```html
<div class="screen" id="pin-screen">...</div>
<div class="screen hidden" id="home-screen">...</div>
```

```css
.screen{position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;z-index:10;transition:opacity .22s,transform .22s;}
.screen.hidden{opacity:0;pointer-events:none;transform:translateY(14px);}
.screen>*{position:relative;z-index:1;}
```

```js
const SCREENS = ['pin-screen','home-screen','fav-screen','form-screen','detail-screen','settings-screen','docs-screen','docview-screen'];
function showScreen(id) {
  SCREENS.forEach(s => document.getElementById(s).classList.toggle('hidden', s!==id));
}
```

**For PaisaTrail:** rename the array to your real screens — e.g.
`['pin-screen','home-screen','add-screen','transactions-screen','filters-screen','stats-screen','settings-screen']`.

---

## 2. Local storage wrapper (`Store`)

```js
const Store = {
  get(k){ return localStorage.getItem(k); },
  set(k,v){ localStorage.setItem(k,v); },
};
```

Good for small flags (PIN hash, theme, lockout counters, last-export
timestamp). **Not** for the expense records themselves — those should go in
IndexedDB with date/category indexes once you're building (discussed
separately — the vault stores all entries as one encrypted blob, which
works for a few hundred passwords but won't scale as well to daily expense
entries).

---

## 3. PIN lock screen

```html
<div class="screen" id="pin-screen">
  <div class="vault-brand">
    <div class="brand-icon">🔐</div>
    <div class="brand-name">Vault</div>
    <div class="brand-sub" id="pin-subtitle">Your private password vault</div>
  </div>
  <div class="pin-label" id="pin-label">Enter your 6-digit PIN</div>
  <div class="pin-dots" id="pin-dots">
    <div class="pin-dot" id="d0"></div><div class="pin-dot" id="d1"></div>
    <div class="pin-dot" id="d2"></div><div class="pin-dot" id="d3"></div>
    <div class="pin-dot" id="d4"></div><div class="pin-dot" id="d5"></div>
  </div>
  <div class="numpad">
    <button class="num-btn" data-n="1">1</button><button class="num-btn" data-n="2">2</button><button class="num-btn" data-n="3">3</button>
    <button class="num-btn" data-n="4">4</button><button class="num-btn" data-n="5">5</button><button class="num-btn" data-n="6">6</button>
    <button class="num-btn" data-n="7">7</button><button class="num-btn" data-n="8">8</button><button class="num-btn" data-n="9">9</button>
    <button class="num-btn empty"></button><button class="num-btn" data-n="0">0</button>
    <button class="num-btn del" id="del-btn">⌫</button>
  </div>
  <button id="bio-unlock-btn" style="display:none">👆</button>
</div>
```

```css
.pin-dots{display:flex;gap:16px;justify-content:center;}
.pin-dot{width:15px;height:15px;border-radius:50%;border:2px solid var(--border);background:transparent;
  transition:background .15s,border-color .15s,transform .15s cubic-bezier(.34,1.56,.64,1),box-shadow .15s;}
.pin-dot.filled{background:var(--accent);border-color:var(--accent);
  box-shadow:0 0 0 4px rgba(91,95,245,.18),0 0 16px rgba(91,95,245,.5);transform:scale(1.15);}
.pin-dot.error{background:var(--red);border-color:var(--red);box-shadow:0 0 12px rgba(239,68,68,.4);animation:shake .3s;}

.numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%;max-width:264px;}
.num-btn{aspect-ratio:1;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);
  color:var(--text);font-size:22px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:transform .12s cubic-bezier(.34,1.56,.64,1),background .12s;}
.num-btn:active{transform:scale(.84);background:var(--surface2);}
.num-btn.del{font-size:18px;background:transparent;border-color:transparent;color:var(--muted);}
.num-btn.empty{background:transparent;border:none;pointer-events:none;}

@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}60%{transform:translateX(7px)}}
```

```js
function initPINScreen(mode) {
  state.pinMode=mode; state.pinBuffer=''; updatePINDots();
  const lbl=document.getElementById('pin-label');
  lbl.className='pin-label';
  const msgs = {
    'setup':'Create a 6-digit PIN','setup-confirm':'Confirm your PIN',
    'change-old':'Enter current PIN','change-new':'Enter new PIN','change-confirm':'Confirm new PIN',
    'unlock':'Enter your PIN'
  };
  lbl.textContent = msgs[mode] || 'Enter your PIN';
  if(mode==='unlock'){
    const lock = parseInt(Store.get('lockout')||'0');
    if(Date.now()<lock){ const s=Math.ceil((lock-Date.now())/1000); lbl.textContent=`Too many attempts. Wait ${s}s`; lbl.classList.add('error'); }
  }
}

function updatePINDots(err=false) {
  for(let i=0;i<6;i++){
    const d=document.getElementById('d'+i);
    d.classList.toggle('filled', i<state.pinBuffer.length && !err);
    d.classList.toggle('error', err);
  }
}

function pinError(msg) {
  updatePINDots(true);
  const lbl=document.getElementById('pin-label');
  lbl.textContent=msg; lbl.className='pin-label error';
  setTimeout(()=>{ state.pinBuffer=''; updatePINDots(false); lbl.className='pin-label'; },900);
}

async function handlePINDigit(d) {
  const lock=parseInt(Store.get('lockout')||'0');
  if(state.pinMode==='unlock' && Date.now()<lock){ pinError(`Locked. Wait ${Math.ceil((lock-Date.now())/1000)}s`); return; }
  if(state.pinBuffer.length>=6) return;
  state.pinBuffer+=d; updatePINDots();
  if(state.pinBuffer.length<6) return;
  const entered=state.pinBuffer;
  await new Promise(r=>setTimeout(r,120));

  if(state.pinMode==='setup'){
    state.pinTemp=entered; initPINScreen('setup-confirm');
  } else if(state.pinMode==='setup-confirm'){
    if(entered!==state.pinTemp){ pinError('PINs do not match'); return; }
    Store.set('pin', await Crypto.hashPIN(entered));
    state.currentPIN=entered; unlockSuccess();
  } else if(state.pinMode==='unlock'){
    const hash=await Crypto.hashPIN(entered);
    if(hash!==Store.get('pin')){
      let f=(parseInt(Store.get('fails')||'0'))+1; Store.set('fails',f);
      if(f>=5){ Store.set('lockout',Date.now()+30000); Store.set('fails',0); pinError('Locked for 30s'); }
      else pinError(`Wrong PIN · ${5-f} left`);
      return;
    }
    Store.set('fails','0');
    state.currentPIN=entered; unlockSuccess();
  }
  // change-old / change-new / change-confirm modes follow the same shape —
  // see original file if you need full PIN-change flow.
}
```

```js
// PIN is hashed (SHA-256), never stored or compared in plaintext
const Crypto = {
  enc: new TextEncoder(),
  async hashPIN(pin) {
    const buf = await crypto.subtle.digest('SHA-256', this.enc.encode(pin));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  },
};
```

---

## 4. Idle auto-lock

```js
let autoLockTimer=null;
const AUTO_LOCK_MS = 2*60*1000; // 2 minutes

function resetAutoLock() {
  clearTimeout(autoLockTimer);
  if(!state.unlocked) return;
  autoLockTimer = setTimeout(lockVault, AUTO_LOCK_MS);
}

function lockVault() {
  state.unlocked=false;
  clearTimeout(autoLockTimer);
  const ov=document.getElementById('lock-overlay');
  ov.classList.add('visible');
  setTimeout(()=>{ ov.classList.remove('visible'); initPINScreen('unlock'); showScreen('pin-screen'); },700);
}

document.addEventListener('touchstart', resetAutoLock);
document.addEventListener('click', resetAutoLock);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && state.unlocked) lockVault(); });
```

```css
#lock-overlay{position:fixed;inset:0;background:var(--bg);z-index:500;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  opacity:0;pointer-events:none;transition:opacity .3s;}
#lock-overlay.visible{opacity:1;pointer-events:all;}
```

---

## 5. Step-up re-auth modal → becomes biometric step-up

This is a promise-based "are you sure / re-verify" prompt the original app
uses before sensitive actions. For PaisaTrail's biometric step-up, swap the
PIN-entry resolution for an `attemptBiometric()` call (section 6).

```html
<div id="stepup-overlay" class="delete-overlay">
  <div class="delete-sheet">
    <div class="delete-sheet-icon">🔐</div>
    <div class="delete-sheet-title" id="stepup-title">Enter PIN to continue</div>
    <div class="pin-dots" id="stepup-dots">
      <div class="pin-dot" id="sd0"></div><div class="pin-dot" id="sd1"></div>
      <div class="pin-dot" id="sd2"></div><div class="pin-dot" id="sd3"></div>
      <div class="pin-dot" id="sd4"></div><div class="pin-dot" id="sd5"></div>
    </div>
    <div class="pin-label" id="stepup-label"></div>
    <div class="numpad">
      <button class="num-btn" data-su="1">1</button><button class="num-btn" data-su="2">2</button><button class="num-btn" data-su="3">3</button>
      <button class="num-btn" data-su="4">4</button><button class="num-btn" data-su="5">5</button><button class="num-btn" data-su="6">6</button>
      <button class="num-btn" data-su="7">7</button><button class="num-btn" data-su="8">8</button><button class="num-btn" data-su="9">9</button>
      <button class="num-btn empty"></button><button class="num-btn" data-su="0">0</button>
      <button class="num-btn del" id="stepup-del">⌫</button>
    </div>
    <button class="delete-sheet-cancel" id="stepup-cancel">Cancel</button>
  </div>
</div>
```

```css
.delete-overlay{position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.55);
  backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;
  padding:24px;opacity:0;pointer-events:none;transition:opacity .22s;}
.delete-overlay.active{opacity:1;pointer-events:all;}
.delete-sheet{width:100%;max-width:340px;background:var(--surface2);border:1.5px solid var(--border);
  border-radius:28px;padding:32px 24px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;}
.delete-sheet-icon{width:72px;height:72px;border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:32px;}
.delete-sheet-title{font-size:20px;font-weight:800;}
.delete-sheet-cancel{width:100%;padding:14px;border-radius:var(--radius);border:1.5px solid var(--border);
  background:transparent;font-size:15px;font-weight:600;cursor:pointer;}
```

```js
let stepUpResolve = null;
let stepUpBuffer = '';

function updateStepUpDots(err=false) {
  for(let i=0;i<6;i++){
    const d=document.getElementById('sd'+i);
    d.classList.toggle('filled', i<stepUpBuffer.length && !err);
    d.classList.toggle('error', err);
  }
}

function closeStepUp(success=false) {
  document.getElementById('stepup-overlay').classList.remove('active');
  stepUpBuffer=''; updateStepUpDots();
  if(stepUpResolve){ stepUpResolve(success); stepUpResolve=null; }
}

// Returns Promise<bool> — true once verified
function requirePIN(title='Enter PIN to continue') {
  return new Promise(resolve => {
    stepUpResolve = resolve;
    stepUpBuffer = '';
    updateStepUpDots();
    document.getElementById('stepup-title').textContent = title;
    document.getElementById('stepup-overlay').classList.add('active');
  });
}

document.querySelectorAll('.num-btn[data-su]').forEach(b=>b.addEventListener('click', async ()=>{
  if(stepUpBuffer.length>=6) return;
  stepUpBuffer+=b.dataset.su; updateStepUpDots();
  if(stepUpBuffer.length<6) return;
  const hash=await Crypto.hashPIN(stepUpBuffer);
  if(hash!==Store.get('pin')){
    updateStepUpDots(true);
    setTimeout(()=>{ stepUpBuffer=''; updateStepUpDots(false); },900);
    return;
  }
  closeStepUp(true);
}));
document.getElementById('stepup-del').addEventListener('click',()=>{ stepUpBuffer=stepUpBuffer.slice(0,-1); updateStepUpDots(); });
document.getElementById('stepup-cancel').addEventListener('click',()=>closeStepUp(false));
```

---

## 6. Biometric unlock (WebAuthn)

```js
function isBioEnabled() { return Store.get('bio')==='1'; }
function isBioAvailable() { return !!(window.PublicKeyCredential); }

async function registerBiometric() {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'PaisaTrail', id: window.location.hostname },
        user: { id: userId, name: 'paisatrail-user', displayName: 'PaisaTrail User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'required', authenticatorAttachment: 'platform' },
        timeout: 30000,
      }
    });
    const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
    Store.set('bio_cred', credId);
    return true;
  } catch(e) { return false; }
}

async function attemptBiometric() {
  try {
    const credIdB64 = Store.get('bio_cred');
    if(!credIdB64) return false;
    const credIdBytes = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge, timeout: 30000, userVerification: 'required',
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: credIdBytes }],
      }
    });
    return !!cred;
  } catch(e) { return false; }
}
```

**For PaisaTrail's step-up:** in section 5, instead of opening the PIN
modal, first try `await attemptBiometric()` — only fall back to the PIN
modal if it fails or isn't available.

---

## 7. Theme toggle (dark/light)

```css
:root {
  --bg: #f0f2f8; --surface: rgba(255,255,255,.72); --text: #1a1d2e; --muted:#9096b8;
  --accent: #5b5ff5; --red:#ef4444; --radius:20px;
}
[data-theme="dark"] {
  --bg: #0f1117; --surface: rgba(30,34,50,.80); --text:#eef0ff; --muted:#555878;
}
```

```js
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  Store.set('theme', dark ? 'dark' : 'light');
}
```

---

## 8. Toast notifications

```html
<div id="toast"></div>
```

```css
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(16px);
  background:var(--text);color:var(--bg);padding:10px 20px;border-radius:20px;
  font-size:13px;font-weight:700;z-index:999;opacity:0;transition:all .22s;
  white-space:nowrap;pointer-events:none;}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
```

```js
let toastT;
function toast(msg, dur=2200) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),dur);
}
```

---

## 9. Swipe-to-delete

```css
.entry-card-wrap{position:relative;flex-shrink:0;border-radius:var(--radius);overflow:hidden;}
.swipe-delete-bg{position:absolute;right:0;top:0;bottom:0;width:88px;
  background:linear-gradient(135deg,#ef4444,#dc2626);
  display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;
  pointer-events:none;cursor:pointer;z-index:0;opacity:0;transition:opacity .15s;}
.swipe-delete-bg.revealed{ pointer-events:all; opacity:1; }
.entry-card{position:relative;z-index:1;transition:margin-right .25s cubic-bezier(.32,1,.28,1);
  border-radius:var(--radius);margin-right:0;}
.entry-card.swiped{margin-right:88px;}
```

```js
function addSwipeToDelete(container) {
  const SWIPE_PX = 88;
  let activeCard=null, activeDelBg=null, startX=0, startY=0;
  let dirLocked=false, isHoriz=false, dragging=false, wasOpen=false;

  function snapOpen(card, delBg) {
    card.style.marginRight = SWIPE_PX + 'px';
    card.classList.add('swiped');
    delBg.classList.add('revealed'); delBg.style.opacity='1';
  }
  function snapClose(card, delBg) {
    card.style.marginRight = '';
    card.classList.remove('swiped');
    delBg.style.opacity='0';
    setTimeout(() => delBg.classList.remove('revealed'), 280);
  }
  function closeAll() {
    container.querySelectorAll('.entry-card').forEach(c => {
      const bg = c.closest('.entry-card-wrap')?.querySelector('.swipe-delete-bg');
      if(bg) snapClose(c, bg);
    });
  }
  function onDocMove(e) {
    if (!activeCard) return;
    const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (!dirLocked) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      isHoriz = Math.abs(dx) > Math.abs(dy) * 1.3;
      dirLocked = true;
      if (!isHoriz) { activeCard = null; return; }
      if (activeDelBg) activeDelBg.style.opacity = '1';
    }
    e.preventDefault();
    dragging = true;
    activeCard.style.transition = 'none';
    const base = wasOpen ? SWIPE_PX : 0;
    const clamped = Math.min(SWIPE_PX, Math.max(0, base + (-dx)));
    activeCard.style.marginRight = clamped + 'px';
  }
  function onDocEnd(e) {
    if (!activeCard) return;
    document.removeEventListener('touchmove', onDocMove);
    document.removeEventListener('touchend', onDocEnd);
    const card = activeCard, delBg = activeDelBg, open = wasOpen, didDrag = dragging;
    activeCard = activeDelBg = null; dragging = false;
    if (!didDrag) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (!open && dx < -(SWIPE_PX * 0.45)) snapOpen(card, delBg);
    else if (open && dx > (SWIPE_PX * 0.3)) snapClose(card, delBg);
    else if (open) snapOpen(card, delBg);
    else snapClose(card, delBg);
  }
  container.querySelectorAll('.entry-card-wrap').forEach(wrap => {
    const card = wrap.querySelector('.entry-card');
    const delBg = wrap.querySelector('.swipe-delete-bg');
    wrap.addEventListener('touchstart', e => {
      const currentOpen = container.querySelector('.entry-card.swiped');
      if (currentOpen && currentOpen !== card) closeAll();
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      dirLocked = false; isHoriz = false; dragging = false;
      wasOpen = card.classList.contains('swiped');
      activeCard = card; activeDelBg = delBg;
      document.addEventListener('touchmove', onDocMove, {passive: false});
      document.addEventListener('touchend', onDocEnd, {passive: true});
    }, {passive: true});
  });
}
```

**For PaisaTrail:** rename `.entry-card` → `.expense-card` (or keep as-is and
just reuse the class names) and wire the delete-bg click to your
`deleteExpense(id)`.

---

## 10. Attachments — IndexedDB file storage (`DocsDB`)

The original encrypts every file (since vault docs are sensitive). For
expense receipts you probably don't need that — you can call
`crypto.subtle` steps as no-ops, or just store the raw `ArrayBuffer`
directly. Decide this when we build; both versions are trivial.

```js
const AttachmentsDB = {
  db: null,
  async open(){
    if(this.db) return this.db;
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open('PaisaTrailFiles', 1);
      req.onupgradeneeded = (e)=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = (e)=>{ this.db=e.target.result; resolve(this.db); };
      req.onerror = (e)=>reject(e.target.error);
    });
  },
  async saveFile(id, arrayBuffer){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readwrite');
      tx.objectStore('files').put(arrayBuffer, id);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  },
  async loadFile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readonly');
      const req=tx.objectStore('files').get(id);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  },
  async deleteFile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('files','readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  },
};
```

```js
// File type detection — same idea as the vault's DOC_FILE_TYPES map
const FILE_TYPES = {
  pdf:   { icon:'📕', label:'PDF' },
  image: { icon:'🖼️', label:'Image' },
  word:  { icon:'📘', label:'Doc' },
  other: { icon:'📁', label:'File' },
};
function fileType(mimeType, name=''){
  const m=(mimeType||'').toLowerCase(), n=name.toLowerCase();
  if(m==='application/pdf'||n.endsWith('.pdf')) return 'pdf';
  if(m.startsWith('image/')) return 'image';
  if(m.includes('word')||n.endsWith('.doc')||n.endsWith('.docx')) return 'word';
  return 'other';
}

function fileToArrayBuffer(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}
function arrayBufferToObjectUrl(ab, mimeType){
  return URL.createObjectURL(new Blob([ab],{type:mimeType||'application/octet-stream'}));
}
// Thumbnail for image attachments — used in list rows
function arrayBufferToThumb(ab, mimeType){
  return new Promise(resolve=>{
    try{
      const url=URL.createObjectURL(new Blob([ab],{type:mimeType}));
      const img=new Image();
      img.onload=()=>{
        const MAX=80, scale=Math.min(1,MAX/Math.max(img.width,img.height));
        const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg',0.7));
      };
      img.onerror=()=>{ URL.revokeObjectURL(url); resolve(null); };
      img.src=url;
    } catch(e){ resolve(null); }
  });
}
```

```html
<input type="file" id="attach-file-input" accept="image/*,.pdf,.doc,.docx" capture="environment" style="display:none">
```

---

## 11. Backup reminder + JSON export

```js
function checkBackupNudge() {
  const lastExport = parseInt(Store.get('last_export')||'0');
  const lastDismiss = parseInt(Store.get('nudge_dismissed')||'0');
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  if (lastDismiss && (now - lastDismiss) < THIRTY_DAYS) return;
  if (!lastExport || (now - lastExport) > THIRTY_DAYS) {
    // show a dismissible "back up your data" banner — see vault's
    // #backup-nudge-wrap markup for the exact HTML/CSS treatment
  }
}

function doExport(dataObj) {
  const blob = new Blob([JSON.stringify(dataObj)],{type:'application/octet-stream'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `paisatrail-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  Store.set('last_export', Date.now().toString());
  toast('Backup exported ✓');
}
```

---

## 12. Export/import bundle with attached files (JSZip)

The vault lazy-loads JSZip from a CDN only when export/import is actually
used, instead of bundling it always:

```js
let JSZipLib = null;
async function loadJSZip(){
  if(JSZipLib) return JSZipLib;
  try{
    const mod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    JSZipLib = mod.default || mod;
    return JSZipLib;
  } catch(e){ console.error('JSZip load failed', e); return null; }
}
```

Export flow: build a `manifest.json` of all expense metadata (no binary
data), then add each attachment's real file into a `files/` folder inside
the zip, named by its original filename — so the backup is human-readable
even outside the app. Import flow: read `manifest.json`, walk each entry,
pull its file from `files/<name>`, write it into `AttachmentsDB`, and
de-duplicate by filename if re-importing over existing data. (Full
read/write loop is straightforward — ask when you're ready to build this
part and I'll write it directly against your real expense schema.)

---

## 13. Cloud sync (reference only — not pasted)

The original vault has a working Firebase/Firestore sync module
(`CloudSync`) for multi-device backup. This is out of scope for
PaisaTrail's v1/v2 — flagged here so you remember it exists if you want
real cross-device sync later (our "v3"). Ask for that section specifically
when you get there.

---

## What's intentionally left out
- Password-specific logic: strength scoring, card/Aadhaar number formatting, per-entry-type custom fields, expiry-date alerts. PaisaTrail's parallels (recurring-expense due dates, category icon/color editor, budget alerts) get written fresh.
- The vault's decorative background gradients/noise texture — recreate fresh in PaisaTrail's colorful palette rather than reuse the purple/glass look.
