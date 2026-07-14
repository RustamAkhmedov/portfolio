window.addEventListener('load', () => {
    setTimeout(() => document.getElementById('boot').classList.add('hidden'), 900);
  });

  function tick(){
    const d = new Date();
    document.getElementById('clock').textContent = d.toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
  }
  tick(); setInterval(tick, 30000);

  // ============ SCROLL-PROGRESS + FLOW-RAIL + PARALLAX ============
  // macht aus dem Runterscrollen einen durchgehenden Prozess statt einzelner Sektionen
  const scrollFill = document.getElementById('scrollbar-fill');
  const flowDot = document.getElementById('flow-dot');
  const mainCol = document.querySelector('.main-col');
  const pixelIcons = document.querySelector('.pixel-icons');

  function updateScrollFx(){
    const doc = document.documentElement;
    const pageMax = doc.scrollHeight - doc.clientHeight;
    const pageProgress = pageMax > 0 ? window.scrollY / pageMax : 0;
    if (scrollFill) scrollFill.style.width = (pageProgress * 100).toFixed(2) + '%';

    if (flowDot && mainCol){
      const rect = mainCol.getBoundingClientRect();
      const railTop = rect.top + window.scrollY + 6;
      const railHeight = mainCol.offsetHeight - 12;
      const viewportCenter = window.scrollY + window.innerHeight * 0.4;
      let pos = viewportCenter - railTop;
      pos = Math.max(0, Math.min(railHeight, pos));
      flowDot.style.top = pos + 'px';
    }

    if (pixelIcons){
      const drift = window.scrollY * 0.04;
      pixelIcons.style.transform = 'translateY(' + (-drift) + 'px)';
    }
  }
  window.addEventListener('scroll', updateScrollFx, { passive:true });
  window.addEventListener('resize', updateScrollFx);
  updateScrollFx();

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('in-view'); });
  }, {threshold:0.15});
  document.querySelectorAll('.mac-window').forEach(w => obs.observe(w));

  // Pulldown-Menüs (File / View)
  function toggleMenu(id){
    document.querySelectorAll('.menu').forEach(m => { if(m.id !== id) m.classList.remove('open'); });
    document.getElementById(id).classList.toggle('open');
  }
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.menu')) document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
  });

  // Try it out: Karte anklicken = aufklappen (immer nur eine gleichzeitig offen)
  function toggleTryout(card){
    const wasExpanded = card.classList.contains('expanded');
    document.querySelectorAll('.tryout-card.expanded').forEach(c => c.classList.remove('expanded'));
    if(!wasExpanded){
      card.classList.add('expanded');
      const iframe = card.querySelector('iframe[data-src]');
      if(iframe && !iframe.src){ iframe.src = iframe.dataset.src; }
      card.scrollIntoView({behavior:'smooth', block:'nearest'});
    }
  }

  // Rotierender Typewriter-Text unter dem Titel
  const twPhrases = ['IT-Security Interessiert', 'C++ · Java · JS Developer', 'HTL Pinkafeld — Ausbildung', 'Baut an: KI + MCP-Server', 'Hostet gerne lokale LLMs'];
  const twEl = document.getElementById('tw-text');
  let twPhraseIdx = 0, twCharIdx = 0, twDeleting = false;
  function typewriterTick(){
    const phrase = twPhrases[twPhraseIdx];
    if(!twDeleting){
      twCharIdx++;
      twEl.textContent = phrase.slice(0, twCharIdx);
      if(twCharIdx === phrase.length){ twDeleting = true; setTimeout(typewriterTick, 1600); return; }
      setTimeout(typewriterTick, 55);
    } else {
      twCharIdx--;
      twEl.textContent = phrase.slice(0, twCharIdx);
      if(twCharIdx === 0){ twDeleting = false; twPhraseIdx = (twPhraseIdx + 1) % twPhrases.length; setTimeout(typewriterTick, 300); return; }
      setTimeout(typewriterTick, 28);
    }
  }
  typewriterTick();

  // Code-Fenster: tippt abwechselnd kleine Snippets
  const codeSnippets = [
`<span class="c-kw">class</span> Rustam {
<span class="c-kw">public</span>:
    <span class="c-kw">void</span> vibeCode();
    <span class="c-kw">bool</span> isAvailable = <span class="c-kw">true</span>;
};`,
`<span class="c-com">// HolyC-Style, for Terry</span>
<span class="c-kw">U8</span> j;
<span class="c-kw">for</span> (j = 0; j < 10; j++)
    PrintF(<span class="c-str">"Divine Intervention\\n"</span>);`,
`<span class="c-kw">def</span> ship_project(idea):
    <span class="c-kw">while</span> <span class="c-kw">not</span> idea.done:
        idea.iterate()
    <span class="c-kw">return</span> <span class="c-str">"deployed"</span>`
  ];
  const codeEl = document.getElementById('code-body');
  let csIdx = 0;
  function typeCode(){
    const raw = codeSnippets[csIdx];
    // Tags als atomare Einheiten behandeln, damit HTML nicht mitten im Tag geschnitten wird
    const tokens = raw.match(/<[^>]+>|[^<]/g) || [];
    let i = 0;
    codeEl.innerHTML = '';
    function step(){
      if(i < tokens.length){
        codeEl.innerHTML = tokens.slice(0, i + 1).join('') + '<span class="c-cursor">▌</span>';
        i++;
        setTimeout(step, 16);
      } else {
        setTimeout(() => { csIdx = (csIdx + 1) % codeSnippets.length; typeCode(); }, 2600);
      }
    }
    step();
  }
  typeCode();

  const claudeSprite = document.getElementById('claude-sprite');

  // Interaktionen: Streicheln (hover) und Schlagen (click)
  claudeSprite.addEventListener('mouseenter', () => {
    claudeSprite.classList.add('pet');
    claudeSprite.setAttribute('data-face','happy');
  });
  claudeSprite.addEventListener('mouseleave', () => {
    claudeSprite.classList.remove('pet');
    claudeSprite.setAttribute('data-face','normal');
  });
  claudeSprite.addEventListener('click', (e) => {
    e.stopPropagation();
    claudeSprite.classList.add('hit');
    claudeSprite.setAttribute('data-face','surprised');
    clearTimeout(claudeSprite._hitTimer);
    claudeSprite._hitTimer = setTimeout(() => {
      claudeSprite.classList.remove('hit');
      claudeSprite.setAttribute('data-face','normal');
    }, 700);
  });

  // ============ CAT MASCOT INTERACTIONS ============
  const catSprite = document.getElementById('cat-sprite');
  let catCurrentAnimation = 'idle';
  let catIsMoving = false;   // true waehrend einer zufaelligen Run/Idle-Bewegung
  let catIsHovering = false; // true solange die Maus ueber der Katze ist
  let catIsBiting = false;   // true solange die linke Maustaste auf der Katze gedrueckt ist
  let catIdleTimer = null;

  function setCatAnimation(anim) {
    if (catCurrentAnimation === anim) return;
    catSprite.classList.remove('idle', 'run', 'purr', 'bite');
    catSprite.classList.add(anim);
    catCurrentAnimation = anim;

    if (anim === 'idle') {
      startCatSpeechLoop();
    } else {
      stopCatSpeechLoop();
    }
  }

  // ============ CAT SPEECH BUBBLE (nur im Idle-Zustand, durchwechselnde Sprueche) ============
  const catSpeechEl = document.getElementById('cat-speech');
  const catPhrases = [
    'miau~',
    'The name is Lizzie',
    'sudo pet me',
    'Your claude limit has been reached',
    'i will guard your code',
    'just a short break...',
    'purr.exe is running',
    'Senior dev here',
    'git commit -m "sleep"',
    'pet me (hover) 💜',
    'push on a Friday afternoon',
    'Bug found. It was me.',
    'compiling... zzz',
    'rm -rf /'
  ];
  let catPhraseIdx = -1;
  let catSpeechTimer = null;
  let catSpeechHideTimer = null;

  function pickNextPhrase(){
    let next;
    do {
      next = Math.floor(Math.random() * catPhrases.length);
    } while (next === catPhraseIdx && catPhrases.length > 1);
    catPhraseIdx = next;
    return catPhrases[next];
  }

  function showCatSpeech(){
    if (!catSpeechEl) return;
    catSpeechEl.textContent = pickNextPhrase();
    catSpeechEl.classList.add('visible');
    clearTimeout(catSpeechHideTimer);
    catSpeechHideTimer = setTimeout(() => {
      catSpeechEl.classList.remove('visible');
    }, 3200);
  }

  function startCatSpeechLoop(){
    if (catSpeechTimer) return;
    showCatSpeech();
    catSpeechTimer = setInterval(() => {
      if (catCurrentAnimation === 'idle') showCatSpeech();
    }, 5000);
  }

  function stopCatSpeechLoop(){
    clearInterval(catSpeechTimer);
    catSpeechTimer = null;
    clearTimeout(catSpeechHideTimer);
    if (catSpeechEl) catSpeechEl.classList.remove('visible');
  }

  function playTone(freq1, freq2, type, duration, startGain) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq1, audioContext.currentTime);
      if (freq2 !== undefined) oscillator.frequency.exponentialRampToValueAtTime(freq2, audioContext.currentTime + duration);
      gainNode.gain.setValueAtTime(startGain, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
      // Audio context not supported
    }
  }

  function startRandomMovement() {
    // Waehrend gehovert oder gebissen wird, keine zufaellige Bewegung starten
    if (catIsMoving || catIsHovering || catIsBiting) return;
    catIsMoving = true;

    // Randomisieren: Idle oder Running
    const shouldRun = Math.random() > 0.4;

    if (shouldRun) {
      setCatAnimation('run');
      const duration = 3000 + Math.random() * 2000;
      setTimeout(() => {
        catIsMoving = false;
        clearTimeout(catIdleTimer);
        catIdleTimer = setTimeout(() => {
          if (!catIsMoving && !catIsHovering && !catIsBiting) setCatAnimation('idle');
        }, 300);
      }, duration);
    } else {
      setCatAnimation('idle');
      const duration = 2000 + Math.random() * 2000;
      setTimeout(() => {
        catIsMoving = false;
      }, duration);
    }
  }

  catSprite.addEventListener('mouseenter', () => {
    catSprite.classList.add('scale-up');
    catIsHovering = true;
    if (!catIsBiting) {
      setCatAnimation('purr');
      playTone(150, undefined, 'sine', 0.5, 0.1);
    }
  });

  catSprite.addEventListener('mouseleave', () => {
    catSprite.classList.remove('scale-up');
    catIsHovering = false;
    if (!catIsBiting) {
      setCatAnimation(catIsMoving ? 'run' : 'idle');
    }
  });

  catSprite.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // nur linke Maustaste
    e.stopPropagation();
    catIsBiting = true;
    catIsMoving = true; // zufaellige Bewegung waehrenddessen pausieren
    setCatAnimation('bite');
  });

  function endBite() {
    if (!catIsBiting) return;
    catIsBiting = false;
    catIsMoving = false;
    setCatAnimation(catIsHovering ? 'purr' : 'idle');
  }
  window.addEventListener('mouseup', endBite);

  // Katze startet im Idle-Zustand -> Sprechblasen-Loop direkt anwerfen
  startCatSpeechLoop();

  // Random movement and idle animation every 3-7 seconds
  setInterval(() => {
    if (!catIsMoving && !catIsHovering && !catIsBiting) {
      startRandomMovement();
    }
  }, 3000 + Math.random() * 4000);
