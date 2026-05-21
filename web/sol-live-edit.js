/**
 * <sol-live-edit> — live split-pane editor web component.
 * Attributes: source="URL"  format="turtle|csv|markdown|html|mermaid|jsonld|graphviz"
 *             readonly  (boolean — disables save button)
 * Properties: fetchFn (Function) — authenticated fetch; content (string get/set)
 * Events: sol-change({content}), sol-save({content,url}), sol-load({content,url})
 */

import { buildEditor } from './utils/code-mirror-editor.js';
import { CSS, sheet as LIVE_EDIT_SHEET } from './styles/sol-live-edit-css.js';
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';

// Pre-loaded module registry — kept as an optional escape hatch for
// hosts that want to inject custom renderers/help/examples. Standard
// hosts no longer need it: the dynamic import()s below use static
// string literals, so bundlers (rollup with inlineDynamicImports, esbuild
// in IIFE) inline the modules at build time and runtime import() returns
// the bundled module Promise without a network fetch.
const _preloaded = { renderers: {}, help: {}, examples: {} };

const RENDERERS = {
  turtle:   () => _preloaded.renderers.turtle   || import('./utils/renderers/turtle.js').then(m => m.renderTurtle),
  jsonld:   () => _preloaded.renderers.jsonld   || import('./utils/renderers/jsonld.js').then(m => m.renderJsonLd),
  csv:      () => _preloaded.renderers.csv      || import('./utils/renderers/csv.js').then(m => m.renderCSV),
  markdown: () => _preloaded.renderers.markdown || import('./utils/renderers/markdown.js').then(m => m.renderMarkdown),
  mermaid:  () => _preloaded.renderers.mermaid  || import('./utils/renderers/mermaid.js').then(m => m.renderMermaid),
  html:     () => _preloaded.renderers.html     || import('./utils/renderers/html.js').then(m => m.renderHtml),
  graphviz: () => _preloaded.renderers.graphviz || import('./utils/renderers/graphviz.js').then(m => m.renderGraphviz),
};
const _rendererCache = {};

const HELP = {
  turtle:   () => _preloaded.help.turtle   || import('./utils/live-edit-help/turtle.js').then(m => m.turtleHelp),
  jsonld:   () => _preloaded.help.jsonld   || import('./utils/live-edit-help/jsonld.js').then(m => m.jsonldHelp),
  csv:      () => _preloaded.help.csv      || import('./utils/live-edit-help/csv.js').then(m => m.csvHelp),
  markdown: () => _preloaded.help.markdown || import('./utils/live-edit-help/markdown.js').then(m => m.markdownHelp),
  mermaid:  () => _preloaded.help.mermaid  || import('./utils/live-edit-help/mermaid.js').then(m => m.mermaidHelp),
  graphviz: () => _preloaded.help.graphviz || import('./utils/live-edit-help/graphviz.js').then(m => m.graphvizHelp),
};

const EXAMPLES = {
  turtle:   () => _preloaded.examples.turtle   || import('../data/live-edit/turtle.js').then(m => m.example),
  jsonld:   () => _preloaded.examples.jsonld   || import('../data/live-edit/jsonld.js').then(m => m.example),
  csv:      () => _preloaded.examples.csv      || import('../data/live-edit/csv.js').then(m => m.example),
  markdown: () => _preloaded.examples.markdown || import('../data/live-edit/markdown.js').then(m => m.example),
  mermaid:  () => _preloaded.examples.mermaid  || import('../data/live-edit/mermaid.js').then(m => m.example),
  html:     () => _preloaded.examples.html     || import('../data/live-edit/html.js').then(m => m.example),
  graphviz: () => _preloaded.examples.graphviz || import('../data/live-edit/graphviz.js').then(m => m.example),
};

const ZOOM_FMTS = new Set(['turtle','jsonld','graphviz','markdown','mermaid']);

const EXT = {ttl:'turtle',n3:'turtle',turtle:'turtle',jsonld:'jsonld',csv:'csv',tsv:'csv',
             md:'markdown',markdown:'markdown',mmd:'mermaid',mermaid:'mermaid',
             html:'html',htm:'html',dot:'graphviz',gv:'graphviz'};

const MIME = {'text/turtle':'turtle','text/n3':'turtle','application/ld+json':'jsonld',
              'text/csv':'csv','text/tab-separated-values':'csv','text/markdown':'markdown',
              'text/x-markdown':'markdown','text/html':'html','text/x-mermaid':'mermaid',
              'text/vnd.graphviz':'graphviz','text/x-dot':'graphviz'};

const FMIME = {turtle:'text/turtle',jsonld:'application/ld+json',csv:'text/csv',
               markdown:'text/markdown',html:'text/html',mermaid:'text/x-mermaid',
               graphviz:'text/vnd.graphviz'};

const CM_EXT = {turtle:'ttl',jsonld:'jsonld',markdown:'md',html:'html'};

/**
 * Live split-pane editor web component.
 *
 * CodeMirror syntax highlighting, preview rendering, and format-specific help.
 *
 * @class SolLiveEdit
 * @extends HTMLElement
 * @attr {string} source - URL to load
 * @attr {string} format - turtle|csv|markdown|html|mermaid|jsonld|graphviz
 * @attr {boolean} readonly - disables save button
 * @property {Function} fetchFn - authenticated fetch function
 * @property {string} content - editor content (get/set)
 * @fires sol-change - detail: { content }
 * @fires sol-save - detail: { content, url }
 * @fires sol-load - detail: { content, url }
 * @fires sol-zoom - detail: { zoom, pct }
 * @fires sol-format - detail: { format, canZoom, canStats }
 */
class SolLiveEdit extends HTMLElement {
  static get observedAttributes() { return ['source','format','readonly']; }
  static registerModules({ renderers, help, examples } = {}) {
    if (renderers) Object.assign(_preloaded.renderers, renderers);
    if (help) Object.assign(_preloaded.help, help);
    if (examples) Object.assign(_preloaded.examples, examples);
  }
  constructor() {
    super();
    this._fn=null;this._cm=null;this._db=null;this._sim=null;this._fmt=null;this._statsOn=false;
    this._cfg={view:'both',keys:'default'};this._zoom=1.0;
    this.attachShadow({mode:'open'});
  }
  get fetchFn(){return this._fn;} set fetchFn(f){this._fn=f;}
  get content(){return this._cm?this._cm.getValue():'';}
  set content(t){this._setContent(t);}
  get format(){return this._fmt;}

  async connectedCallback(){await this._init();}
  attributeChangedCallback(n,_,v){
    if(!this.shadowRoot.firstChild)return;
    if(n==='source')this._loadSrc(v);
    if(n==='format')this._setFmt(v);
  }

  // ── Public API for host page buttons ────────────────────────────────────────
  get canZoom()  { return ZOOM_FMTS.has(this._fmt); }
  get canStats() { return this._fmt === 'csv'; }
  get zoom()     { return Math.round(this._zoom * 100); }
  zoomIn()       { this._setZoom(this._zoom + 0.2); }
  zoomOut()      { this._setZoom(this._zoom - 0.2); }
  save()         { this._save(); }
  toggleSettings(){ this._toggleCfg(); }
  toggleHelp()   { this._toggleHelp(); }
  toggleStats()  { this._toggleStats(); }

  async _init(){
    const s=this.shadowRoot;
    s.innerHTML=`
<div class="sle-toolbar" id="toolbar">
  <button type="button" class="sle-btn" id="statsBtn" hidden>Statistics</button>
  <div class="sle-zoom" id="zoomctl" hidden>
    <button type="button" id="zmOut" title="Zoom out" aria-label="Zoom out">−</button>
    <span id="zmPct">100%</span>
    <button type="button" id="zmIn" title="Zoom in" aria-label="Zoom in">+</button>
  </div>
  <button type="button" class="sle-btn sle-btn-primary" id="svBtn">Save</button>
  <button type="button" class="sle-btn" id="cfgBtn" title="Settings" aria-label="Settings">⚙</button>
  <button type="button" class="sle-btn" id="hlpBtn" title="Help" aria-label="Help">?</button>
</div>
<div class="er" id="er"></div>
<div class="cf" id="cf">
  <div class="cg">
    <b>View</b>
    <label><input type="radio" name="sle-view" value="both"> Both</label>
    <label><input type="radio" name="sle-view" value="editor"> Editor only</label>
    <label><input type="radio" name="sle-view" value="preview"> Preview only</label>
  </div>
  <div class="cg">
    <b>Key bindings</b>
    <label><input type="radio" name="sle-keys" value="default"> Default</label>
    <label><input type="radio" name="sle-keys" value="emacs"> Emacs</label>
    <label><input type="radio" name="sle-keys" value="vim"> Vim</label>
  </div>
</div>
<div class="modal-backdrop" id="modal">
  <div class="modal-box" id="modalBox">
    <button class="modal-close" id="modalClose">\u00d7</button>
    <div id="modalBody"></div>
  </div>
</div>
<div class="body">
  <div class="ep" id="ep"></div>
  <div class="sle-resizer" id="resizer" title="Drag to resize"></div>
  <div class="pp" id="pp">
    <div id="po" style="width:100%;height:100%;position:relative"></div>
  </div>
</div>`;
    s.adoptedStyleSheets = [];
    adopt(s, { sheet: LIVE_EDIT_SHEET, css: CSS });

    // Settings dropdown change handler
    s.getElementById('cf').addEventListener('change',e=>{
      const nm=e.target.name;if(!nm?.startsWith('sle-'))return;
      const k=nm.slice(4);this._cfg[k]=e.target.value;this._saveCfg();
      if(k==='view')this._applyView();
      else{const p=this.content;this._buildEditor().then(()=>this._setContent(p));}
    });

    // Close modal on backdrop click or close button
    s.getElementById('modal').addEventListener('click',e=>{
      if(e.target===s.getElementById('modal'))this._closeModal();
    });
    s.getElementById('modalClose').addEventListener('click',()=>this._closeModal());

    // Toolbar — Save / Settings / Help / Zoom / Statistics. Zoom and
    // Statistics are shown per-format (see _setFmt); Save is hidden
    // when the component is readonly.
    s.getElementById('zmOut').addEventListener('click',()=>this.zoomOut());
    s.getElementById('zmIn').addEventListener('click',()=>this.zoomIn());
    s.getElementById('statsBtn').addEventListener('click',()=>this.toggleStats());
    s.getElementById('svBtn').addEventListener('click',()=>this.save());
    s.getElementById('cfgBtn').addEventListener('click',e=>{e.stopPropagation();this.toggleSettings();});
    s.getElementById('hlpBtn').addEventListener('click',()=>this.toggleHelp());
    if(this.hasAttribute('readonly'))s.getElementById('svBtn').style.display='none';

    // Close settings dropdown when clicking outside
    s.addEventListener('click',e=>{
      const cf=s.getElementById('cf');
      if(cf.classList.contains('on')&&!cf.contains(e.target))cf.classList.remove('on');
    });

    // Resizer — drag the bar between editor and preview panes.
    const rz=s.getElementById('resizer');
    rz.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const body=s.querySelector('.body'),ep=s.getElementById('ep');
      rz.setPointerCapture(e.pointerId);
      rz.classList.add('dragging');
      const move=ev=>{
        const r=body.getBoundingClientRect(),min=120;
        const w=Math.max(min,Math.min(ev.clientX-r.left,r.width-min));
        ep.style.flex='0 0 '+w+'px';
      };
      const up=()=>{
        rz.classList.remove('dragging');
        rz.removeEventListener('pointermove',move);
        rz.removeEventListener('pointerup',up);
      };
      rz.addEventListener('pointermove',move);
      rz.addEventListener('pointerup',up);
    });

    this._loadCfg();
    const src=this.getAttribute('source');
    const fmt=this.getAttribute('format')||EXT[src?.split('.').pop()?.toLowerCase()]||'markdown';
    await this._setFmt(fmt);
    this._applyView();
    if(src){await this._loadSrc(src);}
    else{const ex=await(EXAMPLES[fmt]||EXAMPLES.markdown)().catch(()=>'');await this._setContent(ex);}
  }

  async _setFmt(fmt){
    this._fmt=fmt||'markdown';
    this._zoom=1.0;
    const po=this.shadowRoot.getElementById('po');
    if(po){po.style.transform='';po.style.transformOrigin='';po.style.width='';po.style.height='';}
    const zc=this.shadowRoot.getElementById('zoomctl');
    if(zc)zc.hidden=!this.canZoom;
    const zp=this.shadowRoot.getElementById('zmPct');
    if(zp)zp.textContent='100%';
    const sb=this.shadowRoot.getElementById('statsBtn');
    if(sb)sb.hidden=!this.canStats;
    this.dispatchEvent(new CustomEvent('sol-format',{detail:{format:this._fmt,canZoom:this.canZoom,canStats:this.canStats},bubbles:true,composed:true}));
    await this._buildEditor();
  }

  async _buildEditor(){
    const pane=this.shadowRoot.getElementById('ep');
    if(!pane)return;
    if(this._cm){this._cm.destroy();this._cm=null;}
    const extKey=CM_EXT[this._fmt]||null;
    const editorMod=this.constructor.editorModule;
    if(editorMod){
      try{
        const {createEditor}=await import(editorMod);
        this._cm=await createEditor(pane,'',extKey?`f.${extKey}`:'f.txt',
          {dark:false,keyBindings:this._cfg.keys,onChange:()=>this._change()});
        return;
      }catch(_){/* fall through to built-in editor */}
    }
    const view=await buildEditor(pane,extKey,this.shadowRoot,()=>this._change());
    this._cm={
      getValue:()=>view.state.doc.toString(),
      setValue:(v)=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:v}}),
      destroy:()=>view.destroy(),
    };
  }

  _change(){
    clearTimeout(this._db);this._db=setTimeout(()=>this._render(),400);
    this.dispatchEvent(new CustomEvent('sol-change',{detail:{content:this.content},bubbles:true,composed:true}));
  }

  async _setContent(text){
    if(!this._cm)return;
    this._cm.setValue(text);
    await this._render();
  }

  async _render(){
    if(this._sim){this._sim();this._sim=null;}
    const out=this.shadowRoot.getElementById('po');
    const er=this.shadowRoot.getElementById('er');
    if(!out)return;
    if(!_rendererCache[this._fmt]&&RENDERERS[this._fmt])
      _rendererCache[this._fmt]=await RENDERERS[this._fmt]();
    const fn=_rendererCache[this._fmt];
    if(!fn){out.innerHTML='<p style="padding:1rem">No preview.</p>';return;}
    try{
      const r=await fn(this.content,out);
      if(typeof r==='function')this._sim=r;
      er.textContent='';er.classList.remove('on');
    }catch(e){er.textContent=e.message;er.classList.add('on');}
  }

  async _loadSrc(url){
    if(!url)return;
    const fmt=EXT[url.split('?')[0].split('.').pop()?.toLowerCase()]||this._fmt||'markdown';
    if(fmt!==this._fmt)await this._setFmt(fmt);
    try{
      const fn=this._fn||fetch;
      const resp=await fn(url,{cache:'no-store'});
      if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
      const text=await resp.text();
      const mf=MIME[(resp.headers.get('content-type')||'').split(';')[0].trim()];
      if(mf&&mf!==this._fmt)await this._setFmt(mf);
      await this._setContent(text);
      if(!this.hasAttribute('readonly')){
        const sb=this.shadowRoot.getElementById('svBtn');if(sb)sb.style.display='';
      }
      this.dispatchEvent(new CustomEvent('sol-load',{detail:{content:text,url},bubbles:true,composed:true}));
    }catch(e){
      const er=this.shadowRoot.getElementById('er');
      if(er){er.textContent=`Load failed: ${e.message}`;er.classList.add('on');}
    }
  }

  async _save(){
    const url=this.getAttribute('source');const text=this.content;
    this.dispatchEvent(new CustomEvent('sol-save',{detail:{content:text,url},bubbles:true,composed:true}));
    if(!url)return;
    try{
      const fn=this._fn||fetch;
      const r=await fn(url,{method:'PUT',headers:{'Content-Type':FMIME[this._fmt]||'text/plain'},body:text});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
    }catch(e){
      const er=this.shadowRoot.getElementById('er');
      if(er){er.textContent=`Save failed: ${e.message}`;er.classList.add('on');}
    }
  }

  // ── Modal helpers ───────────────────────────────────────────────────────────
  _openModal(html,wide){
    const s=this.shadowRoot;
    const box=s.getElementById('modalBox');
    s.getElementById('modalBody').innerHTML=html;
    box.classList.toggle('wide',!!wide);
    s.getElementById('modal').classList.add('on');
  }
  _closeModal(){
    this.shadowRoot.getElementById('modal').classList.remove('on');
  }

  // ── Help → modal ───────────────────────────────────────────────────────────
  async _toggleHelp(){
    const modal=this.shadowRoot.getElementById('modal');
    if(modal.classList.contains('on')){this._closeModal();return;}
    const ldr=HELP[this._fmt];
    const html=ldr?_helpHtml(await ldr()):'<p>No help available for this format.</p>';
    this._openModal(html);
  }

  // ── Settings → dropdown ────────────────────────────────────────────────────
  _toggleCfg(){
    const cf=this.shadowRoot.getElementById('cf');
    if(!cf)return;
    const opening=!cf.classList.contains('on');
    cf.classList.toggle('on');
    if(opening){
      this.shadowRoot.querySelectorAll('[name^="sle-"]').forEach(r=>{
        r.checked=r.value===this._cfg[r.name.slice(4)];
      });
    }
  }

  // ── Statistics → modal ─────────────────────────────────────────────────────
  async _toggleStats(){
    const modal=this.shadowRoot.getElementById('modal');
    if(modal.classList.contains('on')){this._closeModal();return;}
    try{
      const csvMod = _preloaded.renderers._csvModule || await import('./utils/renderers/csv.js');
      const {parseCSV,calcStats,renderStats}=csvMod;
      const container=document.createElement('div');
      renderStats(calcStats(parseCSV(this.content)),container);
      this._openModal(container.innerHTML,true);
    }catch(e){
      this._openModal(`<p style="color:#c0392b">${_esc(e.message)}</p>`);
    }
  }

  _loadCfg(){try{Object.assign(this._cfg,JSON.parse(localStorage.getItem('sle-cfg')||'{}'));}catch(_){}}
  _saveCfg(){try{localStorage.setItem('sle-cfg',JSON.stringify(this._cfg));}catch(_){}}
  _setZoom(z){
    this._zoom=Math.max(0.2,Math.min(5.0,Math.round(z*5)/5));
    const pct=Math.round(this._zoom*100);
    const zp=this.shadowRoot.getElementById('zmPct');
    if(zp)zp.textContent=pct+'%';
    const po=this.shadowRoot.getElementById('po');
    const pp=this.shadowRoot.getElementById('pp');
    if(po){
      po.style.width=`${100*this._zoom}%`;
      po.style.height=`${100*this._zoom}%`;
    }
    if(pp&&this._zoom>1){
      requestAnimationFrame(()=>{
        pp.scrollLeft=(pp.scrollWidth-pp.clientWidth)/2;
        pp.scrollTop=(pp.scrollHeight-pp.clientHeight)/2;
      });
    }
    this.dispatchEvent(new CustomEvent('sol-zoom',{detail:{zoom:this._zoom,pct},bubbles:true,composed:true}));
  }
  _applyView(){const v=this._cfg.view,sr=this.shadowRoot,ep=sr.getElementById('ep'),pp=sr.getElementById('pp'),rz=sr.getElementById('resizer');if(ep)ep.style.display=v==='preview'?'none':'';if(pp)pp.style.display=v==='editor'?'none':'';if(rz)rz.style.display=v==='both'?'':'none';}
}

function _helpHtml(h){
  if(!h)return'';
  let s=`<h2>${h.title}</h2>`;
  for(const sec of h.sections){
    s+=`<h3>${sec.heading}</h3>`;
    for(const item of sec.items)s+=`<h4>${item.title}</h4><p>${item.description}</p><code>${_esc(item.code)}</code>`;
  }
  return s;
}
function _esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

define('sol-live-edit',SolLiveEdit);
export { SolLiveEdit };
export default SolLiveEdit;
