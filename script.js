/* ═══════════════════════════════════════════════════════
   Quran Portal — script.js
   Flip-book with drag physics, fuzzy search, custom audio
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ── Surah Data ── */
const SURAHS = [
  "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
  "هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
  "الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
  "لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
  "فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
  "الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
  "الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
  "نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
  "التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
  "الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
  "القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
  "المسد","الإخلاص","الفلق","الناس"
];

/* surah 9 (التوبة) has no Bismillah */
const NO_BISMILLAH = new Set([9]);
const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

/* ── Fuzzy Search (Levenshtein) ── */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_,i) =>
    Array.from({length: n+1}, (_,j) => i===0 ? j : j===0 ? i : 0));
  for (let i=1;i<=m;i++)
    for (let j=1;j<=n;j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function fuzzyMatch(query, text) {
  query = query.trim().toLowerCase();
  text  = text.toLowerCase();
  if (!query) return true;
  if (text.includes(query)) return true;
  const q = query.length;
  if (q < 2) return false;
  for (let i=0; i<=text.length - q + 2; i++) {
    const sub = text.slice(Math.max(0,i), Math.min(text.length, i+q+2));
    if (levenshtein(query, sub) <= Math.floor(q/3)+1) return true;
  }
  return false;
}

/* ── Theme System ── */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('qtheme', t);
  document.querySelectorAll('.theme-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.t === t);
  });
}

/* ══════════════════════════════════════
   FLIP BOOK ENGINE
   ══════════════════════════════════════ */

const VERSES_PER_PAGE = 8;

class FlipBook {
  constructor() {
    this.verses      = [];
    this.currentPage = 0;
    this.totalPages  = 0;
    this.surahIndex  = -1;
    this.isFlipping  = false;
    this.isDragging  = false;
    this.dragProgress = 0;

    // DOM refs set in init()
    this.bookOuter    = null;
    this.bookBase     = null;
    this.verseText    = null;
    this.bismillah    = null;
    this.surahTitle   = null;
    this.pageIndicator= null;
    this.prevBtn      = null;
    this.nextBtn      = null;
    this.idleMsg      = null;
    this.flipLayer    = null;

    // Canvas-based drag curl
    this.curlCanvas   = null;
    this.curlCtx      = null;
  }

  init() {
    this.bookOuter    = document.getElementById('bookOuter');
    this.bookBase     = document.getElementById('bookBase');
    this.verseText    = document.getElementById('verseText');
    this.bismillah    = document.getElementById('bismillahLine');
    this.surahTitle   = document.getElementById('surahTitleInBook');
    this.pageIndicator= document.getElementById('pageIndicator');
    this.prevBtn      = document.getElementById('prevPageBtn');
    this.nextBtn      = document.getElementById('nextPageBtn');
    this.idleMsg      = document.getElementById('flipbookIdle');
    this.flipLayer    = document.getElementById('pageFlipLayer');

    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.turnPage(-1));
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.turnPage(+1));

    // Corner handle drag
    const corner = document.getElementById('pageCornerHandle');
    if (corner) {
      corner.addEventListener('click', () => this.turnPage(+1));
      this._initDragCurl(corner);
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')  this.turnPage(+1);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   this.turnPage(-1);
    });

    // Swipe
    let touchStartX = 0;
    if (this.bookOuter) {
      this.bookOuter.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, {passive:true});
      this.bookOuter.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) this.turnPage(diff > 0 ? +1 : -1);
      });
    }
  }

  _initDragCurl(corner) {
    // Create overlay canvas for curl effect
    this.curlCanvas = document.createElement('canvas');
    this.curlCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8999;';
    document.body.appendChild(this.curlCanvas);
    this.curlCtx = this.curlCanvas.getContext('2d');
    this._resizeCurl();
    window.addEventListener('resize', () => this._resizeCurl());

    let startX = 0, startY = 0, curX = 0, curY = 0;
    const isMobile = () => window.innerWidth < 768;

    const onStart = (x, y) => {
      if (this.isFlipping) return;
      this.isDragging = true;
      startX = curX = x;
      startY = curY = y;
      this._drawCurl(curX, curY, 0);
    };
    const onMove = (x, y) => {
      if (!this.isDragging) return;
      curX = x; curY = y;
      const progress = Math.min(1, Math.max(0, (startX - x) / (window.innerWidth * 0.5)));
      this.dragProgress = progress;
      this._drawCurl(curX, curY, progress);
    };
    const onEnd = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this._clearCurl();
      if (this.dragProgress > 0.35) this.turnPage(+1);
      this.dragProgress = 0;
    };

    corner.addEventListener('mousedown',  e => onStart(e.clientX, e.clientY));
    document.addEventListener('mousemove', e => { if (this.isDragging) onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup',   () => onEnd());

    corner.addEventListener('touchstart',  e => onStart(e.touches[0].clientX, e.touches[0].clientY), {passive:true});
    document.addEventListener('touchmove',  e => { if (this.isDragging) onMove(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
    document.addEventListener('touchend',   () => onEnd());
  }

  _resizeCurl() {
    if (!this.curlCanvas) return;
    this.curlCanvas.width  = window.innerWidth;
    this.curlCanvas.height = window.innerHeight;
  }

  _drawCurl(cx, cy, progress) {
    if (!this.curlCtx) return;
    const ctx = this.curlCtx;
    const W = this.curlCanvas.width, H = this.curlCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (progress < 0.01) return;

    // Compute curl triangle from bottom-left corner
    const bookRect = this.bookBase ? this.bookBase.getBoundingClientRect() : {left:0, bottom:H, right:W, top:0};
    const bx = bookRect.left, by = bookRect.top, bw = bookRect.width, bh = bookRect.height;

    const cornerX = bx;
    const cornerY = by + bh;
    const flipW   = Math.min(bw, progress * bw * 1.6 + 40);
    const flipH   = Math.min(bh * 0.6, flipW * 0.8);

    // Peeled page shadow
    const grd = ctx.createLinearGradient(cornerX, cornerY, cornerX + flipW, cornerY - flipH);
    grd.addColorStop(0,   'rgba(0,0,0,0.25)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.1)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.quadraticCurveTo(cornerX + flipW * 0.3, cornerY - flipH * 0.5, cornerX + flipW, cornerY - flipH);
    ctx.lineTo(cornerX, cornerY);
    ctx.closePath();
    ctx.fillStyle = grd;
    ctx.fill();

    // Curled page face
    const style = getComputedStyle(document.documentElement);
    const pageBg = style.getPropertyValue('--page-bg').trim() || '#fffef8';
    const pageGrd = ctx.createLinearGradient(cornerX, cornerY - flipH, cornerX + flipW, cornerY);
    pageGrd.addColorStop(0,   pageBg);
    pageGrd.addColorStop(0.7, pageBg);
    pageGrd.addColorStop(1,   'rgba(200,180,140,0.8)');

    ctx.beginPath();
    ctx.moveTo(cornerX, cornerY);
    ctx.quadraticCurveTo(cornerX + flipW * 0.5, cornerY - flipH * 0.2, cornerX + flipW, cornerY - flipH);
    ctx.quadraticCurveTo(cornerX + flipW * 0.3 - 10, cornerY - flipH * 0.1 + 8, cornerX, cornerY);
    ctx.fillStyle = pageGrd;
    ctx.fill();

    ctx.restore();
  }

  _clearCurl() {
    if (this.curlCtx) {
      this.curlCtx.clearRect(0, 0, this.curlCanvas.width, this.curlCanvas.height);
    }
  }

  async loadSurah(index) {
    this.surahIndex  = index;
    this.currentPage = 0;
    this.verses      = [];

    if (this.idleMsg)  this.idleMsg.style.display  = 'none';
    if (this.bookOuter) {
      this.bookOuter.classList.add('open');
      this.bookOuter.style.opacity = '0';
    }

    this._showLoading();

    try {
      const resp = await fetch(`https://api.alquran.cloud/v1/surah/${index + 1}`);
      const data = await resp.json();
      this.verses = data.data.ayahs.map(a => ({ text: a.text, number: a.numberInSurah }));
      this.totalPages = Math.ceil(this.verses.length / VERSES_PER_PAGE);
      this._renderPage(0);
      if (this.bookOuter) {
        this.bookOuter.style.transition = 'opacity 0.4s ease';
        this.bookOuter.style.opacity = '1';
      }
    } catch (e) {
      this._showError();
    }
  }

  _showLoading() {
    if (!this.verseText) return;
    this.bismillah.style.display = 'none';
    this.surahTitle.textContent  = '';
    this.verseText.innerHTML = `
      <div class="verses-loading">
        <i class="fas fa-spinner"></i>
        جاري تحميل الآيات الكريمة…
      </div>`;
    this._updateNav(0, 1);
  }

  _showError() {
    if (!this.verseText) return;
    this.verseText.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">تعذّر تحميل الآيات، يرجى التحقق من الاتصال.</div>';
  }

  _renderPage(page, direction = 0) {
    const start = page * VERSES_PER_PAGE;
    const slice = this.verses.slice(start, start + VERSES_PER_PAGE);

    // Bismillah: only on first page, only if surah has it
    const showBismillah = page === 0 && !NO_BISMILLAH.has(this.surahIndex + 1);
    this.bismillah.style.display = showBismillah ? 'block' : 'none';

    this.surahTitle.textContent = `سورة ${SURAHS[this.surahIndex]} — صفحة ${page+1} من ${this.totalPages}`;

    // Build inline verse text (continuous flow)
    let html = '';
    slice.forEach(v => {
      html += `<span class="verse-inline">${v.text}</span>`;
      html += `<span class="verse-end-marker">${v.number}</span> `;
    });
    this.verseText.innerHTML = html;

    this._updateNav(page, this.totalPages);
    this.currentPage = page;
  }

  _updateNav(page, total) {
    if (this.pageIndicator) {
      this.pageIndicator.textContent = total > 0 ? `${page+1} / ${total}` : '';
    }
    if (this.prevBtn) this.prevBtn.disabled = page <= 0;
    if (this.nextBtn) this.nextBtn.disabled = page >= total - 1;
  }

  turnPage(dir) {
    if (this.isFlipping) return;
    const next = this.currentPage + dir;
    if (next < 0 || next >= this.totalPages) return;
    this.isFlipping = true;

    // Trigger flip animation
    if (this.flipLayer) {
      const fp = document.createElement('div');
      fp.className = 'flip-page';
      this.flipLayer.appendChild(fp);

      requestAnimationFrame(() => {
        fp.classList.add(dir > 0 ? 'animate-in' : 'animate-out');
      });

      // Mid-animation: swap content
      setTimeout(() => {
        this._renderPage(next, dir);
      }, 220);

      // Cleanup
      setTimeout(() => {
        fp.remove();
        this.isFlipping = false;
      }, 480);

      // Trigger out
      setTimeout(() => {
        fp.classList.replace(dir > 0 ? 'animate-in' : 'animate-out',
                             dir > 0 ? 'animate-out' : 'animate-in');
      }, 240);
    } else {
      this._renderPage(next, dir);
      this.isFlipping = false;
    }
  }
}

/* ══════════════════════════════════════
   CUSTOM AUDIO PLAYER
   ══════════════════════════════════════ */

class AudioPlayer {
  constructor() {
    this.audio      = new Audio();
    this.isPlaying  = false;
    this.card       = null;
    this.nowPlaying = null;
    this.playPauseBtn = null;
    this.progressBar  = null;
    this.timeEl      = null;
    this.durationEl  = null;
    this.volumeSlider = null;

    this.audio.addEventListener('timeupdate',  () => this._onTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => this._onMeta());
    this.audio.addEventListener('ended',       () => this._onEnded());
    this.audio.addEventListener('play',        () => this._setPlaying(true));
    this.audio.addEventListener('pause',       () => this._setPlaying(false));
  }

  init() {
    this.card       = document.getElementById('audioCard');
    this.nowPlaying = document.getElementById('nowPlayingText');
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.progressBar  = document.getElementById('audioProgress');
    this.timeEl      = document.getElementById('audioTime');
    this.durationEl  = document.getElementById('audioDuration');
    this.volumeSlider = document.getElementById('volumeSlider');

    if (!this.card) return;

    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    }

    const skipBack = document.getElementById('skipBackBtn');
    const skipFwd  = document.getElementById('skipFwdBtn');
    if (skipBack) skipBack.addEventListener('click', () => { this.audio.currentTime = Math.max(0, this.audio.currentTime - 10); });
    if (skipFwd)  skipFwd.addEventListener('click',  () => { this.audio.currentTime += 10; });

    if (this.progressBar) {
      this.progressBar.addEventListener('input', () => {
        if (this.audio.duration) this.audio.currentTime = (this.progressBar.value / 100) * this.audio.duration;
      });
    }

    if (this.volumeSlider) {
      this.audio.volume = 0.9;
      this.volumeSlider.value = 90;
      this.volumeSlider.addEventListener('input', () => {
        this.audio.volume = this.volumeSlider.value / 100;
      });
    }
  }

  load(src, label) {
    this.audio.src = src;
    this.audio.load();
    if (this.card) this.card.classList.add('visible');
    if (this.nowPlaying) this.nowPlaying.textContent = `سورة ${label}`;
    this._resetProgress();
    this.audio.play().catch(() => {});
  }

  togglePlayPause() {
    if (this.audio.paused) this.audio.play().catch(()=>{});
    else this.audio.pause();
  }

  _setPlaying(playing) {
    this.isPlaying = playing;
    if (this.playPauseBtn) {
      const icon = this.playPauseBtn.querySelector('i');
      if (icon) icon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    }
  }

  _onTimeUpdate() {
    if (!this.audio.duration) return;
    const pct = (this.audio.currentTime / this.audio.duration) * 100;
    if (this.progressBar) {
      this.progressBar.value = pct;
      this.progressBar.style.background =
        `linear-gradient(to left, var(--bg-elevated) ${100-pct}%, var(--accent-1) ${100-pct}%)`;
    }
    if (this.timeEl) this.timeEl.textContent = this._fmt(this.audio.currentTime);
  }

  _onMeta() {
    if (this.durationEl) this.durationEl.textContent = this._fmt(this.audio.duration);
  }

  _onEnded() { this._setPlaying(false); }

  _resetProgress() {
    if (this.progressBar) { this.progressBar.value = 0; this.progressBar.style.background = ''; }
    if (this.timeEl) this.timeEl.textContent = '0:00';
    if (this.durationEl) this.durationEl.textContent = '0:00';
  }

  _fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }
}

/* ══════════════════════════════════════
   MAIN INIT
   ══════════════════════════════════════ */

const flipBook    = new FlipBook();
const audioPlayer = new AudioPlayer();

document.addEventListener('DOMContentLoaded', () => {

  /* ── Theme ── */
  const savedTheme = localStorage.getItem('qtheme') || 'sapphire';
  applyTheme(savedTheme);
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => applyTheme(pill.dataset.t));
  });

  /* ── Build Surah List ── */
  const surahListEl = document.getElementById('surahList');
  if (surahListEl) {
    SURAHS.forEach((name, i) => {
      const li = document.createElement('li');
      li.className = 'surah-item';
      li.dataset.index = i;
      li.innerHTML = `
        <span class="surah-num">${i+1}</span>
        <span class="surah-name">${name}</span>`;
      surahListEl.appendChild(li);
    });

    /* Click handler */
    surahListEl.addEventListener('click', (e) => {
      const item = e.target.closest('.surah-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      // Active state
      surahListEl.querySelectorAll('.surah-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // Load
      flipBook.loadSurah(idx);
      if (typeof audioLinks !== 'undefined') {
        audioPlayer.load(audioLinks[idx], SURAHS[idx]);
      }
    });
  }

  /* ── Surah Search (fuzzy) ── */
  const surahSearch = document.getElementById('surahSearch');
  if (surahSearch && surahListEl) {
    surahSearch.addEventListener('input', () => {
      const q = surahSearch.value.trim();
      surahListEl.querySelectorAll('.surah-item').forEach((item, i) => {
        const numStr = (i+1).toString();
        const match  = !q || numStr.includes(q) || fuzzyMatch(q, SURAHS[i]) || fuzzyMatch(q, numStr);
        item.style.display = match ? '' : 'none';
      });
    });
  }

  /* ── Init engines ── */
  flipBook.init();
  audioPlayer.init();

  /* ── Fade in ── */
  requestAnimationFrame(() => {
    document.querySelectorAll('.fade-in').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 80 + i * 60);
    });
  });
});

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('qtheme', t);
  document.querySelectorAll('.theme-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.t === t);
  });
}
