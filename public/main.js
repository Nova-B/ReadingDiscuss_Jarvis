/* ===== 상태 ===== */
const State = { IDLE: 'idle', LISTENING: 'listening', THINKING: 'thinking', SPEAKING: 'speaking' };
let currentState = State.IDLE;
let ws = null;
let recognition = null;
let currentPersona = '';
let isMicActive = false;

/* ===== DOM ===== */
const $ = id => document.getElementById(id);
const orbContainer  = $('orbContainer');
const orbIcon       = $('orbIcon');
const stateLabel    = $('stateLabel');
const micBtn        = $('micBtn');
const responseText  = $('responseText');
const transcript    = $('transcript');
const sessionLog    = $('sessionLog');
const statusDot     = $('statusDot');
const statusText    = $('statusText');
const personaSelect = $('personaSelect');
const bookSelect    = $('bookSelect');
const initBtn       = $('initBtn');
const waveformEl    = $('waveform');
const rateGroup     = $('rateGroup');
const pitchGroup    = $('pitchGroup');

/* ===== 상태 맵 ===== */
const stateIcons   = { idle:'◈', listening:'◉', thinking:'◌', speaking:'◆' };
const stateLabels  = { idle:'대기 중', listening:'듣는 중...', thinking:'생각 중...', speaking:'말하는 중...' };

/* ===== 원형 파형 (Speaking) ===== */
const NS          = 'http://www.w3.org/2000/svg';
const WAVE_N      = 28;      // 바 개수
const WAVE_R_IN   = 68;      // 오브 엣지 (반지름 60 + 8 여백)
const WAVE_CX     = 140;
const WAVE_CY     = 140;

let cWaveData     = [];      // [{line, angle, x1, y1, phase, speed}]
let speakingRaf   = null;

function createCircularWave() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'circular-wave');
  svg.setAttribute('id', 'circularWave');
  svg.setAttribute('viewBox', '0 0 280 280');

  cWaveData = [];
  for (let i = 0; i < WAVE_N; i++) {
    const angle = (i / WAVE_N) * Math.PI * 2 - Math.PI / 2;
    const x1 = WAVE_CX + WAVE_R_IN * Math.cos(angle);
    const y1 = WAVE_CY + WAVE_R_IN * Math.sin(angle);

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x1.toFixed(2));
    line.setAttribute('y2', y1.toFixed(2));
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke', 'rgba(0,120,255,0.4)');
    svg.appendChild(line);

    cWaveData.push({
      line, angle, x1, y1,
      phase: Math.random() * Math.PI * 2,
      speed: 1.8 + Math.random() * 3.2,
    });
  }
  orbContainer.appendChild(svg);
}

function animateSpeaking(ts) {
  const t = ts / 1000;
  cWaveData.forEach(({ line, angle, x1, y1, phase, speed }, i) => {
    // 여러 사인파 겹침 → 유기적 파형
    const h = 5
      + 16 * Math.abs(Math.sin(t * speed       + phase))
      + 9  * Math.abs(Math.sin(t * speed * 0.55 + phase + 1.4))
      + 4  * Math.abs(Math.sin(t * 1.3          + i * 0.35));

    const r   = WAVE_R_IN + h;
    line.x2.baseVal.value = WAVE_CX + r * Math.cos(angle);
    line.y2.baseVal.value = WAVE_CY + r * Math.sin(angle);

    // 높이에 따라 dim-blue → bright-cyan
    const v     = Math.min(h / 29, 1);
    const red   = Math.round(v * 60);
    const green = Math.round(120 + v * 92);
    const alpha = (0.35 + v * 0.6).toFixed(2);
    line.setAttribute('stroke', `rgba(${red},${green},255,${alpha})`);
  });
  speakingRaf = requestAnimationFrame(animateSpeaking);
}

function startSpeakingAnim() {
  cancelAnimationFrame(speakingRaf);
  speakingRaf = requestAnimationFrame(animateSpeaking);
}

function stopSpeakingAnim() {
  cancelAnimationFrame(speakingRaf);
  speakingRaf = null;
  // 바 초기화
  cWaveData.forEach(({ line, x1, y1 }) => {
    line.x2.baseVal.value = x1;
    line.y2.baseVal.value = y1;
  });
}

/* ===== 마이크 시각화 (Listening) — Web Audio API ===== */
let audioCtx    = null;
let analyserNode = null;
let micStream   = null;
let micRaf      = null;

async function startMicVisualization() {
  try {
    micStream    = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    audioCtx.createMediaStreamSource(micStream).connect(analyserNode);

    const freq = new Uint8Array(analyserNode.frequencyBinCount);
    const bars = waveformEl.querySelectorAll('span');

    function tick() {
      if (currentState !== State.LISTENING) return;
      analyserNode.getByteFrequencyData(freq);
      bars.forEach((bar, i) => {
        const v = freq[Math.floor(i * freq.length / bars.length)];
        bar.style.height = Math.max(5, v / 5.5) + 'px';
      });
      micRaf = requestAnimationFrame(tick);
    }
    tick();
  } catch {
    // CSS fallback — 아무것도 안 해도 CSS animation이 돌고 있음
  }
}

function stopMicVisualization() {
  cancelAnimationFrame(micRaf);
  micRaf = null;
  if (micStream)  { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx)   { audioCtx.close().catch(() => {}); audioCtx = null; }
  waveformEl.querySelectorAll('span').forEach(b => { b.style.height = ''; });
}

/* ===== setState ===== */
function setState(state) {
  const prev   = currentState;
  currentState = state;
  orbContainer.className = 'orb-container ' + state;
  orbIcon.textContent    = stateIcons[state];
  stateLabel.textContent = stateLabels[state];

  if (state === State.SPEAKING) {
    startSpeakingAnim();
    if (prev === State.LISTENING) stopMicVisualization();
  } else {
    stopSpeakingAnim();
    if (state !== State.LISTENING && prev === State.LISTENING) stopMicVisualization();
  }

  if (state === State.THINKING) {
    responseText.className = 'response-text thinking';
    const dots = ['...', '· · ·', '·  ·  ·'];
    let i = 0;
    window._thinkingInterval = setInterval(() => {
      responseText.textContent = dots[i++ % dots.length];
    }, 500);
  } else {
    clearInterval(window._thinkingInterval);
  }
}

/* ===== 로그 / 트랜스크립트 ===== */
function addLog(text, type = '') {
  const e = document.createElement('div');
  e.className = 'log-entry ' + type;
  e.textContent = `> ${text}`;
  sessionLog.appendChild(e);
  sessionLog.scrollTop = sessionLog.scrollHeight;
}

function addMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  const label = role === 'user' ? 'YOU' : (currentPersona || 'PERSONA');
  msg.innerHTML = `<div class="msg-label">${label}</div><div>${text}</div>`;
  transcript.appendChild(msg);
  transcript.scrollTop = transcript.scrollHeight;
}

/* ===== WebSocket ===== */
function connectWS() {
  ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = () => {
    statusDot.className = 'status-dot online';
    statusText.textContent = '연결됨';
    addLog('서버 연결 완료', 'system');
    loadOptions();
  };
  ws.onclose = () => {
    statusDot.className = 'status-dot error';
    statusText.textContent = '연결 끊김';
    addLog('서버 연결 종료', 'system');
    setState(State.IDLE);
    micBtn.disabled = true;
    setTimeout(connectWS, 3000);
  };
  ws.onerror = () => {
    statusDot.className = 'status-dot error';
    statusText.textContent = '연결 오류';
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'ready') {
      addLog(msg.message, 'system');
      micBtn.disabled = false;
      setState(State.IDLE);
      responseText.textContent = '말하기 버튼을 눌러 대화를 시작하세요.';
      responseText.className = 'response-text';
    }
    if (msg.type === 'thinking') setState(State.THINKING);
    if (msg.type === 'response') handleResponse(msg.text);
    if (msg.type === 'error') {
      setState(State.IDLE);
      responseText.textContent = '⚠ ' + msg.message;
      responseText.className = 'response-text error';
      addLog('오류: ' + msg.message);
    }
  };
}

/* ===== 옵션 로드 ===== */
async function loadOptions() {
  try {
    const [personas, books] = await Promise.all([
      fetch('/api/personas').then(r => r.json()),
      fetch('/api/books').then(r => r.json()),
    ]);
    personas.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      personaSelect.appendChild(o);
    });
    books.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.name;
      bookSelect.appendChild(o);
    });
  } catch (err) {
    addLog('옵션 로드 실패: ' + err.message);
  }
}

/* ===== 세션 초기화 ===== */
initBtn.addEventListener('click', () => {
  const persona = personaSelect.value;
  if (!persona) {
    responseText.textContent = '페르소나를 선택하세요.';
    responseText.className = 'response-text error';
    return;
  }
  currentPersona = persona;
  transcript.innerHTML = '';
  sessionLog.innerHTML = '';
  ws.send(JSON.stringify({ type: 'init', persona, book: bookSelect.value }));
  addLog(`세션 초기화: ${persona}`, 'system');
  setState(State.IDLE);
  micBtn.disabled = true;
  responseText.textContent = '페르소나 로드 중...';
  responseText.className = 'response-text thinking';
});

/* ===== 음성 인식 ===== */
function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addLog('음성 인식 미지원. Chrome을 사용하세요.', 'system');
    return null;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.lang = 'ko-KR';
  rec.continuous = false;
  rec.interimResults = false;

  rec.onstart = () => {
    isMicActive = true;
    micBtn.classList.add('active');
    setState(State.LISTENING);
    addLog('듣는 중...');
    startMicVisualization();
  };
  rec.onresult = (e) => {
    const txt = e.results[0][0].transcript;
    addLog(`입력: "${txt}"`);
    addMessage('user', txt);
    sendMessage(txt);
  };
  rec.onerror = (e) => {
    addLog('음성 인식 오류: ' + e.error);
    setState(State.IDLE);
    micBtn.classList.remove('active');
    isMicActive = false;
  };
  rec.onend = () => {
    micBtn.classList.remove('active');
    isMicActive = false;
    if (currentState === State.LISTENING) setState(State.IDLE);
  };
  return rec;
}

/* ===== 메시지 전송 ===== */
function sendMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'message', text }));
}

/* ===== TTS (edge-tts) ===== */
const RATE_VALS  = ['-30%', '-15%', '+0%', '+20%', '+40%'];
const PITCH_VALS = ['-20Hz', '-10Hz', '+0Hz', '+10Hz', '+20Hz'];

let ttsRateIdx  = 2;
let ttsPitchIdx = 2;

function setActiveSegment(group, idx) {
  group.querySelectorAll('.seg-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
}

rateGroup.addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  ttsRateIdx = parseInt(btn.dataset.idx);
  setActiveSegment(rateGroup, ttsRateIdx);
});

pitchGroup.addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  ttsPitchIdx = parseInt(btn.dataset.idx);
  setActiveSegment(pitchGroup, ttsPitchIdx);
});

async function speak(text, onEnd) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate: RATE_VALS[ttsRateIdx], pitch: PITCH_VALS[ttsPitchIdx] }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `서버 오류 ${res.status}`);
    }
    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); addLog('TTS 완료'); onEnd(); };
    audio.onerror = () => { URL.revokeObjectURL(url); addLog('TTS 재생 오류'); onEnd(); };
    audio.play();
    addLog(`TTS: edge-tts | 속도 ${RATE_VALS[ttsRateIdx]} | 음높이 ${PITCH_VALS[ttsPitchIdx]}`);
  } catch (err) {
    addLog('TTS 오류: ' + err.message);
    onEnd();
  }
}

/* ===== 응답 처리 ===== */
async function handleResponse(text) {
  addMessage('assistant', text);
  responseText.textContent = text;
  responseText.className = 'response-text speaking';
  setState(State.SPEAKING);
  await speak(text, () => {
    setState(State.IDLE);
    responseText.className = 'response-text';
  });
}

/* ===== 마이크 버튼 ===== */
micBtn.addEventListener('click', () => {
  if (currentState === State.THINKING || currentState === State.SPEAKING) return;
  if (!recognition) recognition = setupSpeechRecognition();
  if (isMicActive) recognition.stop();
  else recognition.start();
});

/* ===== 초기화 ===== */
window.addEventListener('load', () => {
  createCircularWave();
  connectWS();
});
