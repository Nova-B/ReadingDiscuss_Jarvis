const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 페르소나 목록 API
app.get('/api/personas', (req, res) => {
  const personaDir = path.join(__dirname, 'personas');
  const files = fs.readdirSync(personaDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'));
  res.json(files.map(f => ({ id: f.replace('.md', ''), name: f.replace('.md', '') })));
});

// 책 목록 API
app.get('/api/books', (req, res) => {
  const bookDir = path.join(__dirname, 'books');
  const files = fs.readdirSync(bookDir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  res.json(files.map(f => ({ id: f, name: f })));
});

// 파일 내용 로드
function loadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// 페르소나·책·대화 전부 stdin 하나로 구성
// --system 인자를 쓰지 않음 — 페르소나 파일의 따옴표·특수문자가 shell을 깨뜨리는 문제 방지
function buildStdinMessage(personaContent, bookContent, conversationHistory, userMessage) {
  const historyText = conversationHistory
    .map(m => `${m.role === 'user' ? '사용자' : '페르소나'}: ${m.content}`)
    .join('\n');

  const parts = [];

  parts.push(
    `[역할 설정]\n` +
    `아래 페르소나 설정을 완전히 따르세요. ` +
    `응답은 2~4문장, 음성 출력용이므로 마크다운 서식(##, **, - 등) 사용 금지.\n\n` +
    personaContent
  );

  if (bookContent) {
    parts.push(`[오늘의 독서 텍스트]\n${bookContent}`);
  }

  if (historyText) {
    parts.push(`[이전 대화]\n${historyText}`);
  }

  parts.push(`사용자: ${userMessage}`);

  return parts.join('\n\n---\n\n');
}

// Claude CLI subprocess 호출
function askClaude(personaContent, bookContent, conversationHistory, userMessage) {
  return new Promise((resolve, reject) => {
    const stdinMessage = buildStdinMessage(personaContent, bookContent, conversationHistory, userMessage);

    // --print 만 사용 — 특수문자 포함 인자 없음, shell: true 로 claude.cmd 인식
    const proc = spawn('claude', ['--print'], {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let error = '';

    // stdin 에러를 잡지 않으면 서버 프로세스 전체가 죽음
    proc.stdin.on('error', (err) => {
      console.error('stdin 오류:', err.message);
    });

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { error += d.toString(); });

    proc.stdin.write(stdinMessage, 'utf8');
    proc.stdin.end();

    proc.on('close', (code) => {
      if (output.trim()) {
        resolve(output.trim());
      } else {
        console.error('Claude stderr:', error);
        reject(new Error(error.trim() || `종료 코드 ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`claude 실행 실패: ${err.message}`));
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('응답 시간 초과 (60s)'));
    }, 60000);
  });
}

// WebSocket 연결 처리
wss.on('connection', (ws) => {
  console.log('클라이언트 연결됨');

  let sessionPersona = '';
  let sessionBook = '';
  let conversationHistory = [];

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // 세션 초기화 (페르소나·책 선택)
    if (msg.type === 'init') {
      conversationHistory = [];

      const personaPath = path.join(__dirname, 'personas', `${msg.persona}.md`);
      const bookPath = path.join(__dirname, 'books', msg.book || '');

      sessionPersona = loadFile(personaPath);
      sessionBook = msg.book ? loadFile(bookPath) : '';

      ws.send(JSON.stringify({
        type: 'ready',
        message: `페르소나 "${msg.persona}" 로드 완료. 대화를 시작하세요.`
      }));
      return;
    }

    // 음성 메시지 처리
    if (msg.type === 'message') {
      const userText = msg.text;

      ws.send(JSON.stringify({ type: 'thinking' }));

      try {
        const response = await askClaude(sessionPersona, sessionBook, conversationHistory, userText);

        // 대화 히스토리 저장 (최근 10턴 유지)
        conversationHistory.push({ role: 'user', content: userText });
        conversationHistory.push({ role: 'assistant', content: response });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }

        ws.send(JSON.stringify({ type: 'response', text: response }));
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          message: err.message
        }));
      }
    }
  });

  ws.on('close', () => console.log('클라이언트 연결 종료'));
});

// 잡히지 않은 에러로 서버 프로세스가 죽는 것 방지
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`독서토론 서버 실행 중: http://localhost:${PORT}`);
});
