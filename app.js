// ==============================
// カブトビール ラベル作成アプリ
// ==============================

// 3種類の書体セット(デザインの絵柄一式)の名前。svgs/font-01/ 〜 font-03/ フォルダに対応
const FONT_SETS = ['font-01', 'font-02', 'font-03'];
const FONT_LABELS = { 'font-01':'書体セット1', 'font-02':'書体セット2', 'font-03':'書体セット3' };
// デザインは9種類固定:design-01 〜 design-09 という名前のリストを自動生成
const DESIGN_IDS = Array.from({length:9}, (_,i)=> 'design-' + String(i+1).padStart(2,'0'));

// svgs/{font-01|02|03}/{design-01..09}.svg を都度読み込み、一度読んだものはキャッシュする。
// ファイルが無い(まだ届いていない書体セットなど)場合は null を返す。
const svgCache = {};
async function loadDesignSvg(fontSet, designId){
  const key = fontSet + '/' + designId;
  if(key in svgCache) return svgCache[key];
  try{
    const res = await fetch('svgs/' + fontSet + '/' + designId + '.svg');
    if(!res.ok) throw new Error('not found');
    svgCache[key] = await res.text();
  }catch(e){
    svgCache[key] = null;
  }
  return svgCache[key];
}

// アプリ全体で今どんな選択がされているかを持つ「状態」。ここを書き換えると
// プレビューや保存内容がすべて連動して変わる
const state = {
  design: DESIGN_IDS[0],
  fontIndex: 0,
  colors: { primary:'#bf3e26', secondary:'#838487', text:'#bf3e26' },
  text: ''
};
let currentScreen = 'top'; // 今表示している画面の名前(top/about/design/color/text/complete)

// ---- SVGの色変更・文字配置の共通処理 ----
const SHAPE_TAGS = ['path','circle','rect','line','polygon','polyline','ellipse'];

// 同じページに複数のSVGを同時に置くと、Illustrator書き出しのクラス名(cls-1など)が
// 衝突するため、インスタンスごとに一意な接頭辞を付けて名前を分離する。
// SVGの中のクラス名(cls-1など)の頭に、指定した文字列を付けて別名にする関数
function namespaceSvg(markup, ns){
  return markup.replace(/cls-/g, ns + '-cls-');
}
// data-name属性が無い場合はid属性から役割名を推定する(書き出し設定のブレに対応)。
// 要素の「役割名」(color-primary-fillなど)を取得する関数
function roleNameOf(el){
  const dn = el.getAttribute('data-name');
  if(dn) return dn;
  const id = el.getAttribute('id') || '';
  return id.replace(/^_/, '');
}
// 要素の役割名が、指定した名前で始まっているかどうかを判定する関数
function matchesRole(el, role){
  return roleNameOf(el).indexOf(role) === 0;
}
// SVGの中から、指定した役割名を持つ要素をすべて探して配列で返す関数
function findByRole(svg, role){
  return Array.from(svg.querySelectorAll('*')).filter(el => matchesRole(el, role));
}
// 指定した役割(色1/色2など)を持つ図形すべてに、色を塗り替える関数。
// attrには'fill'(塗り)か'stroke'(線)を渡す
function applyColor(svg, roleSuffix, attr, color){
  findByRole(svg, '.color-' + roleSuffix).forEach(el=>{
    [el, ...el.querySelectorAll('*')].forEach(n=>{
      const tag = n.tagName ? n.tagName.toLowerCase() : '';
      if(SHAPE_TAGS.includes(tag)) n.style[attr] = color;
    });
  });
}

const SAMPLE_TEXT = 'なまえ サンプル';

// 文字を置く場所を示す目印(.text-01の四角形)を、画面には見えないように隠す関数
function hideTextGuide(svg){
  const guide = findByRole(svg, '.text-01')[0];
  if(guide){ guide.style.fill='none'; guide.style.stroke='none'; guide.style.opacity='0'; }
}

// .text-01の位置に、実際の文字を描き込む処理の本体。
// 枠の高さに合わせた文字サイズで描き、枠の幅をはみ出す場合は自動的に縮小する
function drawTextAt(svg, text, color){
  const guide = findByRole(svg, '.text-01')[0];
  if(!guide) return;
  const x = parseFloat(guide.getAttribute('x'));
  const y = parseFloat(guide.getAttribute('y'));
  const w = parseFloat(guide.getAttribute('width'));
  const h = parseFloat(guide.getAttribute('height'));
  guide.style.fill = 'none';
  guide.style.stroke = 'none';
  guide.style.opacity = '0';

  const ns = 'http://www.w3.org/2000/svg';
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', x + w/2);
  t.setAttribute('y', y + h/2);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('dominant-baseline', 'middle');
  t.setAttribute('font-family', "'Shippori Mincho', serif");
  t.setAttribute('font-weight', '600');
  t.setAttribute('fill', color);
  let fontSize = h * 0.78;
  t.setAttribute('font-size', fontSize);
  t.textContent = text;
  svg.appendChild(t);

  try{
    const len = t.getComputedTextLength();
    if(len > w && len > 0){
      fontSize = fontSize * (w / len) * 0.96;
      t.setAttribute('font-size', fontSize);
    }
  }catch(e){}
}
// ユーザーが入力した文字を描く。空欄なら何も表示しない
function drawUserText(svg, text, color){
  if(!text){ hideTextGuide(svg); return; }
  drawTextAt(svg, text, color);
}
// まだ何も入力されていないときに、色の変化を確認しやすくするための見本文字を描く
function drawSampleText(svg, color){
  drawTextAt(svg, SAMPLE_TEXT, color);
}
// デザイン選択・色選択の画面用:入力済みの文字があればそれを、無ければ見本文字を表示する
function drawPreviewText(svg, color){
  if(state.text){ drawUserText(svg, state.text, color); } else { drawSampleText(svg, color); }
}
// 主色・副色をまとめて塗り替える、よく使うのでひとまとめにした関数
function applyAllColors(svg){
  applyColor(svg, 'primary-fill', 'fill', state.colors.primary);
  applyColor(svg, 'primary-stroke', 'stroke', state.colors.primary);
  applyColor(svg, 'secondary-fill', 'fill', state.colors.secondary);
  applyColor(svg, 'secondary-stroke', 'stroke', state.colors.secondary);
}

// ---- 画面1:デザイン選択 ----
// デザイン選択画面(screen-design)のプレビューを、現在の状態に合わせて描き直す
async function renderPreview(){
  const container = document.getElementById('preview');
  const fontSet = FONT_SETS[state.fontIndex];
  const svgMarkup = await loadDesignSvg(fontSet, state.design);
  if(!svgMarkup){ container.innerHTML = '<div class="placeholder">この書体セットは<br>準備中です</div>'; return; }
  container.innerHTML = namespaceSvg(svgMarkup, 'preview-' + fontSet + '-' + state.design);
  const svg = container.querySelector('svg');
  applyAllColors(svg);
  drawPreviewText(svg, state.colors.text);
}

// デザイン一覧(9個のサムネイル)を作り直す。タップされたら、そのデザインを選択状態にする
async function renderThumbs(){
  const wrap = document.getElementById('carousel');
  wrap.innerHTML = '';
  const fontSet = FONT_SETS[state.fontIndex];
  for(const id of DESIGN_IDS){
    const btn = document.createElement('div');
    btn.className = 'design-thumb' + (id === state.design ? ' selected' : '');
    const svgMarkup = await loadDesignSvg(fontSet, id);
    if(!svgMarkup){
      btn.innerHTML = '<div class="thumb-placeholder">準備中</div>';
    } else {
      btn.innerHTML = namespaceSvg(svgMarkup, 'thumb-' + fontSet + '-' + id);
      const svg = btn.querySelector('svg');
      applyAllColors(svg);
      hideTextGuide(svg);
    }
    btn.addEventListener('click', async ()=>{
      state.design = id;
      await renderThumbs();
      await renderPreview();
      saveStateToStorage();
    });
    wrap.appendChild(btn);
  }
}

// 現在選ばれているフォント(書体セット)の名前を画面に表示する
function renderFont(){
  document.getElementById('fontName').textContent = FONT_LABELS[FONT_SETS[state.fontIndex]];
}

// フォント(書体セット)を1つ前に切り替えるボタン
document.getElementById('fontPrev').addEventListener('click', async ()=>{
  state.fontIndex = (state.fontIndex - 1 + FONT_SETS.length) % FONT_SETS.length;
  renderFont();
  await renderThumbs();
  await renderPreview();
  saveStateToStorage();
});
// フォント(書体セット)を1つ次に切り替えるボタン
document.getElementById('fontNext').addEventListener('click', async ()=>{
  state.fontIndex = (state.fontIndex + 1) % FONT_SETS.length;
  renderFont();
  await renderThumbs();
  await renderPreview();
  saveStateToStorage();
});

// デザイン一覧を左にスクロールさせる矢印ボタン
document.getElementById('prevArrow').addEventListener('click', ()=>{
  const c = document.getElementById('carousel');
  c.scrollBy({left: -c.clientWidth/3 - 10, behavior:'smooth'});
});
// デザイン一覧を右にスクロールさせる矢印ボタン
document.getElementById('nextArrow').addEventListener('click', ()=>{
  const c = document.getElementById('carousel');
  c.scrollBy({left: c.clientWidth/3 + 10, behavior:'smooth'});
});

// 「色選びに進む」ボタン:色選択画面へ移動する
document.getElementById('nextBtn').addEventListener('click', async ()=>{
  await showScreen('color');
});

// ---- 画面切り替え ----
// 画面切り替えの中心となる関数。指定した名前の画面だけを表示し、
// 必要に応じてその画面のプレビューを描き直す
async function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  currentScreen = name;
  if(name === 'color'){
    await renderPreview2();
    renderSwatches();
  }
  if(name === 'text'){
    document.getElementById('textInput').value = state.text;
    await renderPreview3();
  }
  if(name === 'complete'){
    await renderCompleteScreen();
  }
  saveStateToStorage();
}

// ---- 画面2:色選択 ----
// 選べる20色のリスト(色名と実際の色コード)
const COLORS = [
  {n:'赤',h:'#bf3e26'},{n:'黄',h:'#FDD835'},{n:'青',h:'#1E88E5'},{n:'ピンク',h:'#F06292'},{n:'紫',h:'#8E24AA'},
  {n:'水色',h:'#4FC3F7'},{n:'緑',h:'#43A047'},{n:'黄緑',h:'#9CCC65'},{n:'オレンジ',h:'#FB8C00'},{n:'黒',h:'#212121'},
  {n:'パステル赤',h:'#FFCDD2'},{n:'パステル黄',h:'#FFF59D'},{n:'パステル青',h:'#90CAF9'},{n:'パステルピンク',h:'#F8BBD0'},{n:'パステル紫',h:'#CE93D8'},
  {n:'パステル水色',h:'#B3E5FC'},{n:'パステル緑',h:'#C8E6C9'},{n:'パステル黄緑',h:'#DCEDC8'},{n:'パステルオレンジ',h:'#FFCC80'},{n:'グレー',h:'#B0B3B5'}
];
const colorState = { activeTab:'primary' }; // 今どのタブ(色1/色2/文字)を選んでいるか

// 色選択画面(screen-color)のプレビューを描き直す
async function renderPreview2(){
  const container = document.getElementById('preview2');
  const fontSet = FONT_SETS[state.fontIndex];
  const svgMarkup = await loadDesignSvg(fontSet, state.design);
  if(!svgMarkup){ container.innerHTML = '<div class="placeholder">準備中です</div>'; return; }
  container.innerHTML = namespaceSvg(svgMarkup, 'preview2-' + fontSet + '-' + state.design);
  const svg = container.querySelector('svg');
  applyAllColors(svg);
  drawPreviewText(svg, state.colors.text);
}

// 20色のパレット(丸いスウォッチ)を、選択中のタブに応じて作り直す
function renderSwatches(){
  const scroll = document.getElementById('swatchScroll');
  scroll.innerHTML = '';
  for(let p = 0; p < 2; p++){
    const page = document.createElement('div');
    page.className = 'swatch-page';
    COLORS.slice(p*10, p*10+10).forEach(c=>{
      const sw = document.createElement('div');
      sw.className = 'swatch' + (state.colors[colorState.activeTab] === c.h ? ' selected' : '');
      sw.style.background = c.h;
      sw.title = c.n;
      sw.addEventListener('click', async ()=>{
        state.colors[colorState.activeTab] = c.h;
        renderSwatches();
        await renderPreview2();
        saveStateToStorage();
      });
      page.appendChild(sw);
    });
    scroll.appendChild(page);
  }
}

// 「色1」「色2」「文字」タブの切り替え
document.getElementById('colorTabs').addEventListener('click', e=>{
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  document.querySelectorAll('#colorTabs .tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  colorState.activeTab = btn.dataset.role;
  renderSwatches();
});

// 色パレットを1ページ左にスクロールさせる矢印ボタン
document.getElementById('swatchPrev').addEventListener('click', ()=>{
  const s = document.getElementById('swatchScroll');
  s.scrollBy({left: -s.clientWidth, behavior:'smooth'});
});
// 色パレットを1ページ右にスクロールさせる矢印ボタン
document.getElementById('swatchNext').addEventListener('click', ()=>{
  const s = document.getElementById('swatchScroll');
  s.scrollBy({left: s.clientWidth, behavior:'smooth'});
});

// 「デザイン選びに戻る」ボタン
document.getElementById('backToDesign').addEventListener('click', async ()=>{
  await showScreen('design');
  await renderThumbs();
  await renderPreview();
});
// 「文字入れに進む」ボタン
document.getElementById('toText').addEventListener('click', async ()=>{
  await showScreen('text');
});

// ---- 画面3:文字入力 ----
// 文字入力画面(screen-text)のプレビューを描き直す
async function renderPreview3(){
  const container = document.getElementById('preview3');
  const fontSet = FONT_SETS[state.fontIndex];
  const svgMarkup = await loadDesignSvg(fontSet, state.design);
  if(!svgMarkup){ container.innerHTML = '<div class="placeholder">準備中です</div>'; return; }
  container.innerHTML = namespaceSvg(svgMarkup, 'preview3-' + fontSet + '-' + state.design);
  const svg = container.querySelector('svg');
  applyAllColors(svg);
  drawUserText(svg, state.text, state.colors.text);
}

// 入力欄に文字を打つたびに、プレビューへ即座に反映する
document.getElementById('textInput').addEventListener('input', async e=>{
  state.text = e.target.value;
  await renderPreview3();
  saveStateToStorage();
});

// 「色選びに戻る」ボタン
document.getElementById('backToColor').addEventListener('click', async ()=>{
  await showScreen('color');
});
// 「完成！」ボタン:完成画面へ移動する
document.getElementById('toComplete').addEventListener('click', async ()=>{
  await showScreen('complete');
});
// 「文字を直す」ボタン
document.getElementById('backToText').addEventListener('click', async ()=>{
  await showScreen('text');
});

// ---- 画面4:完成(瓶巻きつけ描画・PNG保存) ----
// 今の状態(デザイン・色・文字)を反映した、書き出し用の完全なSVG文字列を作る
async function getCurrentLabelSvgString(){
  const fontSet = FONT_SETS[state.fontIndex];
  const markup = await loadDesignSvg(fontSet, state.design);
  if(!markup) return null;
  const wrap = document.createElement('div');
  wrap.innerHTML = markup;
  const svg = wrap.querySelector('svg');
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  svg.setAttribute('width', vb[2]);
  svg.setAttribute('height', vb[3]);
  applyAllColors(svg);
  drawUserText(svg, state.text, state.colors.text);
  return new XMLSerializer().serializeToString(svg);
}

// SVGの文字列を、画像(Imageオブジェクト)に変換する関数(Canvasに描くために必要)
function svgToImage(svgString){
  return new Promise((resolve, reject)=>{
    const b64 = btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;base64,' + b64;
  });
}

// ラベルのSVGを、指定した大きさのCanvas画像(ラスター画像)に変換する
async function rasterizeLabel(w, h){
  const svgStr = await getCurrentLabelSvgString();
  if(!svgStr) return null;
  const img = await svgToImage(svgStr);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

// 列ごとに縦方向を圧縮して描画し、円柱に巻きついたような見た目を作る簡易処理。
function warpToBottle(srcCanvas, destCtx, destW, destH, curvature){
  const srcW = srcCanvas.width, srcH = srcCanvas.height;
  for(let x = 0; x < destW; x++){
    const u = (x/(destW-1))*2 - 1;
    const scaleY = Math.sqrt(Math.max(0.12, 1 - curvature*u*u));
    const sh = destH*scaleY;
    const sy = (destH-sh)/2;
    const sx = x/(destW-1)*(srcW-1);
    destCtx.drawImage(srcCanvas, sx, 0, Math.max(1, srcW/destW), srcH, x, sy, 1, sh);
    const shade = (1-scaleY)*0.55;
    if(shade > 0.02){
      destCtx.fillStyle = 'rgba(0,0,0,' + shade.toFixed(3) + ')';
      destCtx.fillRect(x, sy, 1, sh);
    }
  }
}

// 仮の瓶イラスト。実際の瓶写真が届き次第、ここを画像描画に差し替える。
function drawBottle(ctx, W, H){
  ctx.clearRect(0, 0, W, H);
  const bodyW = W*0.62, bodyX = (W-bodyW)/2;
  const neckW = W*0.22, neckX = (W-neckW)/2;
  const shoulderY = H*0.22, neckTopY = H*0.04, bottomY = H*0.95;
  const grad = ctx.createLinearGradient(bodyX, 0, bodyX+bodyW, 0);
  grad.addColorStop(0, '#3b2412');
  grad.addColorStop(0.15, '#6b4423');
  grad.addColorStop(0.5, '#8a5a30');
  grad.addColorStop(0.85, '#6b4423');
  grad.addColorStop(1, '#3b2412');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(neckX, neckTopY);
  ctx.lineTo(neckX+neckW, neckTopY);
  ctx.lineTo(neckX+neckW, shoulderY*0.6);
  ctx.quadraticCurveTo(bodyX+bodyW, shoulderY*0.6, bodyX+bodyW, shoulderY);
  ctx.lineTo(bodyX+bodyW, bottomY-20);
  ctx.quadraticCurveTo(bodyX+bodyW, bottomY, bodyX+bodyW-20, bottomY);
  ctx.lineTo(bodyX+20, bottomY);
  ctx.quadraticCurveTo(bodyX, bottomY, bodyX, bottomY-20);
  ctx.lineTo(bodyX, shoulderY);
  ctx.quadraticCurveTo(bodyX, shoulderY*0.6, neckX, shoulderY*0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bodyX+bodyW*0.18, shoulderY, bodyW*0.08, bottomY-shoulderY-20);
  return { bodyX, bodyW, shoulderY, bottomY };
}

// 瓶のイラストの上に、曲面変形したラベルを重ねて1枚の画像に合成する
async function renderBottleCanvas(W, H){
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const { bodyX, bodyW, shoulderY, bottomY } = drawBottle(ctx, W, H);
  const labelW = bodyW*0.86;
  const labelH = labelW * (276.16/283.52);
  const labelX = bodyX + (bodyW-labelW)/2;
  const labelY = shoulderY + (bottomY-shoulderY-labelH)/2 + H*0.03;
  const srcCanvas = await rasterizeLabel(Math.round(labelW*2), Math.round(labelH*2));
  if(srcCanvas){
    const warpCanvas = document.createElement('canvas');
    warpCanvas.width = Math.round(labelW);
    warpCanvas.height = Math.round(labelH);
    warpToBottle(srcCanvas, warpCanvas.getContext('2d'), warpCanvas.width, warpCanvas.height, 0.55);
    ctx.drawImage(warpCanvas, labelX, labelY);
  }
  return canvas;
}

// 完成画面のプレビュー用キャンバスに、瓶+ラベルの合成画像を表示する
async function renderCompleteScreen(){
  const view = document.getElementById('bottleCanvas');
  const composed = await renderBottleCanvas(view.width, view.height);
  view.getContext('2d').clearRect(0, 0, view.width, view.height);
  view.getContext('2d').drawImage(composed, 0, 0);
}

// 通常のブラウザのダウンロード機能を使う(<a download>方式)。GitHub Pagesなど、
// 実際に公開したサイトではこの方法で問題なく動作する。
// 画像データ(blob)を、指定したファイル名でパソコン・スマホに保存させる関数
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

// 「ラベル画像を保存」ボタン:ラベル単体のPNGを高解像度で書き出す
document.getElementById('saveLabel').addEventListener('click', async ()=>{
  const c = await rasterizeLabel(2400, 2338);
  if(!c) return;
  c.toBlob(blob=>{
    downloadBlob(blob, 'kabuto-label.png');
    clearSavedState();
  }, 'image/png');
});
// 「瓶ラベル画像を保存」ボタン:瓶に巻いた完成画像のPNGを高解像度で書き出す
document.getElementById('saveBottle').addEventListener('click', async ()=>{
  const c = await renderBottleCanvas(1600, 2080);
  c.toBlob(blob=>{
    downloadBlob(blob, 'kabuto-bottle.png');
    clearSavedState();
  }, 'image/png');
});

// ---- メニュー ----
// メニューを開くボタン
document.getElementById('menuOpen').addEventListener('click', ()=>{
  document.getElementById('menuOverlay').classList.add('open');
});
// メニューの閉じる(×)ボタン
document.getElementById('menuClose').addEventListener('click', ()=>{
  document.getElementById('menuOverlay').classList.remove('open');
});
// メニューの外側(黒い半透明部分)をタップしたときも閉じるようにする
document.getElementById('menuOverlay').addEventListener('click', e=>{
  if(e.target.id === 'menuOverlay') e.currentTarget.classList.remove('open');
});
// メニュー内の各項目(ホーム/カブトビールって？/ラベル作り)をタップしたときの移動処理
document.querySelectorAll('.menu-item').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    document.getElementById('menuOverlay').classList.remove('open');
    await showScreen(btn.dataset.go);
    if(btn.dataset.go === 'design'){ await renderThumbs(); await renderPreview(); }
  });
});

// ---- TOP画面 ----
// TOP画面の「さっそく始める」ボタン
document.getElementById('startBtn').addEventListener('click', async ()=>{
  await showScreen('design');
  await renderThumbs();
  await renderPreview();
});
// 「カブトビールって？」ページの「ラベル作りをはじめる」ボタン
document.getElementById('aboutToDesign').addEventListener('click', async ()=>{
  await showScreen('design');
  await renderThumbs();
  await renderPreview();
});
// TOP画面に表示する、固定の色・デザインによるサンプルラベルを描く
async function renderTopPreview(){
  const container = document.getElementById('previewTop');
  const svgMarkup = await loadDesignSvg('font-01', DESIGN_IDS[0]);
  if(!svgMarkup) return;
  container.innerHTML = namespaceSvg(svgMarkup, 'top-sample');
  const svg = container.querySelector('svg');
  applyColor(svg, 'primary-fill', 'fill', '#bf3e26');
  applyColor(svg, 'primary-stroke', 'stroke', '#bf3e26');
  applyColor(svg, 'secondary-fill', 'fill', '#838487');
  applyColor(svg, 'secondary-stroke', 'stroke', '#838487');
  hideTextGuide(svg);
}

// ---- 途中保存(LocalStorage) ----
const STORAGE_KEY = 'kabutoLabelState'; // ブラウザに保存するときの目印(キー)の名前
// 現在の状態(デザイン・色・文字・画面位置)をブラウザ内に保存する
function saveStateToStorage(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      design: state.design, fontIndex: state.fontIndex, colors: state.colors, text: state.text, screen: currentScreen
    }));
  }catch(e){}
}
// 前回保存していた状態があれば読み込んで復元する。保存が無ければ何もしない
function loadStateFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const saved = JSON.parse(raw);
    if(saved.design) state.design = saved.design;
    if(typeof saved.fontIndex === 'number') state.fontIndex = saved.fontIndex;
    if(saved.colors) Object.assign(state.colors, saved.colors);
    if(typeof saved.text === 'string') state.text = saved.text;
    return saved.screen || null;
  }catch(e){ return null; }
}
// 保存していた状態を消す(ダウンロード完了時に呼び出す)
function clearSavedState(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
}

// ---- 初期化 ----
// ページを開いた直後に一度だけ実行する初期化処理
(async ()=>{
  const restoredScreen = loadStateFromStorage();
  await renderTopPreview();
  await renderThumbs();
  await renderPreview();
  renderFont();
  if(restoredScreen && restoredScreen !== 'top'){
    await showScreen(restoredScreen);
  }
})();
