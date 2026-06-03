/* ===== 상태 관리 ===== */
const State = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
};

let currentState = State.IDLE;
let ws = null;
let recognition = null;
let currentPersona = '';
let isMicActive = false;

/* ===== DOM 참조 ===== */
const $ = (id) => document.getElementById(id);
const orbContainer = $('orbContainer');
const orbIcon = $('orbIcon');
const stateLabel = $('stateLabel');
const micBtn = $('micBtn');
const responseText = $('responseText');
const transcript = $('transcript');
const sessionLog = $('sessionLog');
const statusDot = $('statusDot');
const statusText = $('statusText');
const personaSelect = $('personaSelect');
const bookSelect = $('bookSelect');
const initBtn = $('initBtn');

/* ===== 상태 아이콘 맵 ===== */
const stateIcons = {
  [State.IDLE]: '◈',
  [State.LISTENING]: '◉',
  [State.THINKING]: '◌',
  [State.SPEAKING]: '◆',
};
const stateLabels = {
  [State.IDLE]: '대기 중',
  [State.LISTENING]: '듣는 중...',
  [State.THINKING]: '생각 중...',
  [State.SPEAKING]: '말하는 중...',
};

/* ===== UI 상태 변경 ===== */
function setState(state) {
  currentState = state;
  orbContainer.className = 'orb-container ' + state;
  orbIcon.textContent = stateIcons[state];
  stateLabel.textContent = stateLabels[state];

  if (state === State.THINKING) {
    responseText.textContent = '...';
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

/* ===== 로그 추가 ===== */
function addLog(text, type = '') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = `> ${text}`;
  sessionLog.appendChild(entry);
  sessionLog.scrollTop = sessionLog.scrollHeight;
}

/* ===== 트랜스크립트 추가 ===== */
function addMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  const label = role === 'user' ? 'YOU' : (currentPersona || 'PERSONA');
  msg.innerHTML = `<div class="msg-label">${label}</div><div>${text}</div>`;
  transcript.appendChild(msg);
  transcript.scrollTop = transcript.scrollHeight;
}

/* ===== WebSocket 연결 ===== */
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

    if (msg.type === 'thinking') {
      setState(State.THINKING);
    }

    if (msg.type === 'response') {
      handleResponse(msg.text);
    }

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
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      personaSelect.appendChild(opt);
    });

    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      bookSelect.appendChild(opt);
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

  ws.send(JSON.stringify({
    type: 'init',
    persona,
    book: bookSelect.value,
  }));

  addLog(`세션 초기화: ${persona}`, 'system');
  setState(State.IDLE);
  micBtn.disabled = true;
  responseText.textContent = '페르소나 로드 중...';
  responseText.className = 'response-text thinking';
});

/* ===== 음성 인식 설정 ===== */
function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addLog('음성 인식 미지원 브라우저. Chrome을 사용하세요.', 'system');
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
  };

  rec.onresult = (e) => {
    const transcript_text = e.results[0][0].transcript;
    addLog(`입력: "${transcript_text}"`);
    addMessage('user', transcript_text);
    sendMessage(transcript_text);
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
    if (currentState === State.LISTENING) {
      setState(State.IDLE);
    }
  };

  return rec;
}

/* ===== 메시지 전송 ===== */
function sendMessage(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'message', text }));
}

/* ===== TTS — 브라우저 내장 ===== */

// Chrome은 getVoices()가 비동기로 로드됨 — 준비될 때까지 대기
function getVoicesReady() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    // 2초 안에 안 오면 빈 배열로라도 진행
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}

async function speak(text, onEnd) {
  // Chrome bug: speechSynthesis가 paused 상태로 걸리는 경우 강제 resume
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();

  const voices = await getVoicesReady();

  // 한국어 → 없으면 en-US → 없으면 첫 번째 음성으로 fallback
  const koVoice = voices.find(v => v.lang === 'ko-KR' || v.lang === 'ko_KR');
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  const selectedVoice = koVoice || enVoice || voices[0] || null;

  addLog(`TTS 음성: ${selectedVoice ? selectedVoice.name : '기본값'}`);

  const utterance = new SpeechSynthesisUtterance(text);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice ? selectedVoice.lang : 'ko-KR';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  utterance.onend = () => { addLog('TTS 완료'); onEnd(); };
  utterance.onerror = (e) => { addLog('TTS 오류: ' + e.error); onEnd(); };

  // Chrome: 약간의 딜레이 없으면 speak()가 묵음 처리되는 경우 있음
  setTimeout(() => window.speechSynthesis.speak(utterance), 150);
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

  if (!recognition) {
    recognition = setupSpeechRecognition();
  }

  if (isMicActive) {
    recognition.stop();
  } else {
    // Chrome 버그: 음성 목록은 비동기 로드 필요
    window.speechSynthesis.getVoices();
    recognition.start();
  }
});

/* ===== 초기화 ===== */
window.addEventListener('load', () => {
  // 보이스 미리 로드 (Chrome 비동기 로드 대응)
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
  connectWS();
});
