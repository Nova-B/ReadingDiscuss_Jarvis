# ReadingDiscuss JARVIS

> 특정 책·마크다운 파일을 컨텍스트로 제공하고, **음성으로 AI 페르소나와 독서토론**하는 JARVIS 스타일 웹 앱.

![스택](https://img.shields.io/badge/Node.js-Express%20%2B%20WebSocket-green) ![TTS](https://img.shields.io/badge/TTS-Web%20Speech%20API-blue) ![AI](https://img.shields.io/badge/AI-Claude%20Code%20CLI-orange)

---

## 주요 기능

- **JARVIS 스타일 HUD UI** — 다크 사이버 테마, 오브 애니메이션, 음성 파형 시각화
- **음성 인식** — 브라우저 내장 Web Speech API (한국어)
- **AI 대화** — Claude Code CLI (`claude --print`) subprocess 방식
- **음성 출력(TTS)** — 브라우저 내장 Web Speech Synthesis (한국어 우선, 없으면 자동 fallback)
- **페르소나 시스템** — 마크다운 파일로 AI 인격 정의, 추가 무제한
- **책 컨텍스트** — `.md` / `.txt` 파일을 `books/` 폴더에 넣으면 자동 인식

---

## 설치 & 실행

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://claude.ai/code) 설치 및 로그인 완료

```bash
# Claude Code 설치 확인
claude --version
```

### 실행

```bash
git clone https://github.com/Nova-B/ReadingDiscuss_Jarvis.git
cd ReadingDiscuss_Jarvis
npm install
node server.js
```

브라우저에서 `http://localhost:3000` 접속

---

## 사용 방법

1. **페르소나 선택** — 왼쪽 패널에서 대화할 AI 인격 선택
2. **책 선택** (선택) — `books/` 폴더의 파일 선택
3. **세션 시작** — `▶ 세션 시작` 클릭
4. **말하기** — 중앙 마이크 버튼 클릭 후 말하면 AI가 음성으로 응답

---

## 책 추가

```bash
# books/ 폴더에 마크다운 또는 텍스트 파일 복사
cp 내책.md books/
```

서버 재시작 없이 브라우저 새로고침만으로 목록에 반영.

---

## 페르소나 추가

`personas/` 폴더에 마크다운 파일 생성. 형식은 `_template.md` 참고.

```
personas/
├── _template.md     ← 작성 가이드
├── 소크라테스.md
└── 비판적독자.md
```

**페르소나 파일 구조**

```markdown
---
name: "페르소나 이름"
expertise: ["분야1", "분야2"]
tone: "어조 한 줄 설명"
---

# 이름 — 독서토론 인격

## 정체성
## 사고방식
## 대화 스타일
## 전문 영역
## 약점·한계
## 시스템 프롬프트 지시 (LLM용)
```

---

## 프로젝트 구조

```
ReadingDiscuss_Jarvis/
├── server.js           # Express + WebSocket 백엔드
├── package.json
├── public/
│   ├── index.html      # JARVIS HUD UI
│   ├── style.css       # 다크 사이버 디자인
│   └── main.js         # 음성인식 + TTS + WebSocket 클라이언트
├── personas/
│   ├── _template.md    # 페르소나 작성 가이드
│   ├── 소크라테스.md
│   └── 비판적독자.md
└── books/              # 독서 컨텍스트 파일 (.md, .txt)
```

---

## 아키텍처

```
[브라우저]
  Web Speech API (STT) → WebSocket → [Node.js 서버]
                                           ↓
                                   claude --print (stdin)
                                           ↓
                                      AI 응답 텍스트
                                           ↓
[브라우저] ← WebSocket ← 응답 전달
  Web Speech Synthesis (TTS) → 음성 출력
```

**Claude 연동 방식:** `claude --print` subprocess + stdin으로 전체 컨텍스트 전달
- `--system` 인자를 쓰지 않음 (페르소나 내 특수문자·따옴표로 인한 shell 오류 방지)
- 책 내용(대용량)도 stdin으로 전달 (ENAMETOOLONG 방지)

---

## 로드맵

- [ ] edge-tts 연동으로 한국어 음성 품질 개선
- [ ] 다중 페르소나 동시 토론
- [ ] 토론 내용 → Obsidian 볼트 자동 저장
- [ ] 페르소나 간 자동 대화 생성
