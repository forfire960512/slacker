# slacker — 진행 상황 & 다음 작업 (세션 인계 문서)

이 문서는 이전 Claude Code 세션에서 다음 세션으로 넘기기 위해 작성됨. 전체 설계 배경은
`docs/ARCHITECTURE.md`를 먼저 읽을 것 — "텍스트+링크 전용 콘텐츠", "BaaS 안 쓰고 자체 WS 서버
직접 구축" 같은 핵심 결정이 거기 적혀있고, 아래 "다음 작업"이 그 원칙과 어떻게 부딪히는지도 설명해둠.

## 이번 세션에서 새로 한 것: 자동화 테스트 스위트 (Vitest, Phase 1)

기존엔 테스트 프레임워크가 전혀 없었음(전부 수동/스크립트 스모크테스트). `packages/core` + `server`에
Vitest 도입, **47개 테스트 전부 통과**, `pnpm -r typecheck`도 전체 그린:

- 루트 `vitest.workspace.ts`(core+server만 참조) + 패키지별 `vitest.config.ts`, `test`/`test:watch` 스크립트.
- `packages/core/src/links.test.ts`(12) / `auth.test.ts`(2) / `ws-client.test.ts`(12, 재연결 지수
  백오프+jitter+cap, `disconnect()` 이후 뒤늦은 close 이벤트 무시 등) / `store.test.ts`(8) — 전부
  `vi.stubGlobal`로 `fetch`/`WebSocket` 모킹, 공유 fake는 `packages/core/src/testing/fakeWebSocket.ts`.
- **`server/src/index.ts`를 `buildApp(opts)` 팩토리로 리팩터** — 예전엔 모듈 top-level에서 무조건
  `app.listen()`이 실행되고 `clients` Map도 모듈 스코프라 테스트가 원천적으로 불가능했음. 이제
  `jwtSecret`/`messageStore` 주입 가능, `clients` Map은 closure로 이동(인스턴스별 격리),
  `import.meta.url` 가드로 직접 실행(`tsx src/index.ts`)될 때만 실서버 기동. **프로덕션 동작은 그대로**
  — `pnpm dev:server`로 실서버 띄워서 `/health`/로그인/WS 왕복(history→send→broadcast, author
  위조 방지, 링크 추출)/`.jwt-secret` 재사용까지 리팩터 후 직접 확인함(사용자 로컬 Postgres 연동
  상태에서 검증).
- `server/src/index.test.ts`(9, `.inject()`로 HTTP 라우트 + 실제 `app.listen({port:0})`으로 `/ws` 왕복)
  / `server/src/store/sqliteMessageStore.test.ts`(4, `:memory:`).

**Phase 2로 미룬 것(다음 세션 후보)**: `postgresMessageStore.ts` 자동 테스트(로컬 Docker 필요),
`packages/ui` React 컴포넌트 테스트(`@testing-library/react`+jsdom 필요, `StatusBadge`가 유일하게
순수 prop-driven이라 첫 타겟으로 적합), `apps/cli`/`desktop`/`mobile`/`vscode-extension` 테스트,
GitHub Actions CI(`.github/workflows/ci.yml` — 레포에 CI 자체가 아직 없음).

## 지금까지 완료 + 실제 검증된 것

빌드 순서(ARCHITECTURE.md 기준) 1~4단계 전부 구현 완료. 커밋 히스토리가 사실상 작업 로그임 —
`git log --oneline`으로 전체 흐름 확인 가능. 각 커밋 메시지에 무엇을 어떻게 검증했는지 상세히
적어뒀음(중요 습관: 이 프로젝트는 지금까지 "타입체크만 통과"가 아니라 실제로 서버 띄우고
브라우저/Electron/VS Code에서 눈으로 확인하는 걸 원칙으로 삼아왔음 — 새 세션도 이어가면 좋음).

### packages/core (`packages/core/src/`)
- `message.ts` — `Message { id, text, links[], author, createdAt }`
- `links.ts` — `extractLinks()`, `splitTextByLinks()` (텍스트 안 링크만 인라인으로 클릭 가능하게)
- `protocol.ts` — WS 이벤트: `ClientEvent = SendEvent{type:"send",text}` /
  `ServerEvent = MessageEvent | ErrorEvent | HistoryEvent`. REST: `LoginRequest/LoginResponse`
- `auth.ts` — `requestLoginToken()` (fetch 기반)
- `ws-client.ts` — `WsClient`: 재연결-백오프 로직 (수동 disconnect는 재연결 안 함, 서버측 종료는 재연결함)
- `store.ts` — zustand `useChatStore`: `login/restoreSession/logout/send`, 상태
  `{status, username, token, messages, lastError}`

### server (`server/src/`)
- Fastify + `@fastify/websocket` + `@fastify/cors`(`origin: true`, **운영 배포 시 좁혀야 함**)
- `POST /auth/login` — **비밀번호 없이** 닉네임만으로 JWT 발급 (`jose`, `sub`=닉네임, 24시간 만료).
  **이게 지금 "다음 작업"에서 진짜 계정 시스템으로 교체하려는 부분.**
- `GET /ws?token=...` — 토큰 검증 → `Map<WebSocket, username>` 등록 → 접속 직후 최근 메시지 50개
  `history` 이벤트 푸시. 메시지 수신 시 `author`는 항상 토큰에서 온 값(클라이언트가 못 속임).
  성공 시 `app.log.info(...)`로 로그 남김 (id/author/text).
- `JWT_SECRET` — env로 안 주면 `server/data/.jwt-secret`에 랜덤 생성해서 저장 (재시작해도 세션 유지)
- `store/` — `MessageStore` 인터페이스, 두 구현체:
  - `sqliteMessageStore.ts` — 기본값, `node:sqlite`(Node 내장, 실험적이지만 별도 설치 불필요)
  - `postgresMessageStore.ts` — `DATABASE_URL` 설정 시 자동 전환, `postgres`(postgres.js) 드라이버,
    **실제 로컬 Docker Postgres로 검증 완료** (스키마 생성/INSERT/SELECT 전부 확인)
  - `store/index.ts`의 `createMessageStore()`가 둘 중 자동 선택
- `docker-compose.yml` + `.env.example` — 로컬 Postgres 띄우는 설정 (`postgres:17-alpine`)
- Windows 콘솔 UTF-8 자동 전환 (`chcp 65001`, 시작 시 1회, win32에서만)

### apps/web
- Vite + React 19 + Tailwind v4, `packages/ui` 컴포넌트 그대로 소비
- `useSessionPersistence.ts` — 로그인 토큰을 `localStorage`에 저장, 새로고침해도 세션 유지
  (`restoreSession()`으로 REST 재호출 없이 바로 WS 재연결)
- **다크모드 + VS Code 테마 매칭**: `src/styles.css`에 시맨틱 CSS 변수 3단 계층
  (`:root` 라이트 기본 → `prefers-color-scheme:dark` → `body.vscode-*`). Tailwind v4 `@theme inline`으로
  `bg-app-bg`, `text-fg`, `bg-accent` 등 유틸리티 클래스 생성. VS Code 웹뷰에선 VS Code가 주입하는
  `--vscode-*` 변수를 그대로 가져다 씀 (실제 VS Code 테마 색과 자동으로 맞춰짐 — DevTools로 가짜
  변수 주입해서 검증 완료, 실제 VS Code에서는 사용자가 아직 최종 확인 안 함, 아래 TODO 참고)

### packages/ui
- `LoginForm`, `ChatView`, `MessageList`, `MessageInput`, `StatusBadge` — 전부 `useChatStore` 직접 구독
  (web/desktop/vscode-extension이 그대로 재사용)
- 링크는 텍스트 안에서 인라인으로만 클릭 가능 (아래 별도 목록으로 중복 표시하던 버그 수정됨)

### apps/desktop (Capacitor Electron)
- `cap add`로 실제 생성됨, **실행+로그인+메시지+영속화까지 실사용 검증 완료**
- 발견하고 고친 버그들:
  - `setWindowOpenHandler`가 외부 링크(채팅 메시지의 URL)를 그냥 막아버리던 문제 →
    `shell.openExternal()` 호출하도록 수정
  - **`cap sync`가 Electron 플랫폼에서 실제로는 파일을 복사 안 하고 성공했다고만 보고하는 버그**
    (원인: `cap add`가 `electron/capacitor.config.ts`를 복사하면서 상대경로를 안 고쳐서 존재하지
    않는 경로를 가리켰음. 고쳐도 sync 자체가 안 먹어서, `cap sync`를 완전히 우회하는
    `apps/desktop/scripts/sync-web.mjs`로 대체함 — **`pnpm --filter desktop sync`를 항상 이걸로 써야
    함, `cap sync`는 쓰지 말 것**)
- 워크플로: `pnpm --filter web build` → `pnpm --filter desktop sync` → `cd apps/desktop/electron && npm run build` → `npx electron ./`

### apps/vscode-extension
- esbuild로 번들(`scripts/build.mjs`), `apps/web/dist`를 `dist/webview`로 복사
- Webview 패널에 CSP+nonce+`asWebviewUri` 재작성 로직까지 구현, **mock으로 코드 레벨 검증은 했지만
  실제 VS Code Extension Development Host에서 사용자가 최종 확인은 안 한 상태** (TODO 참고)

### apps/cli (Ink 터미널)
- `useChatStore` 연결, 로그인/채팅/링크(OSC 8 이스케이프)까지 구현
- `ink-testing-library`로 렌더링 검증(실제 서버 왕복까지 확인), 실제 TTY 키입력 테스트는 이 환경
  제약으로 못 함(사용자가 직접 터미널에서 `pnpm dev:cli`로 확인 필요)

### apps/mobile
- `capacitor.config.ts` + `package.json`만 있음 — **`cap add ios/android` 아직 안 함** (이 환경에
  Android SDK/Xcode 없어서 빌드/검증 불가능했음). ARCHITECTURE.md 순서상으로도 desktop/vscode
  다음 단계라 우선순위 낮음.

## 아직 안 끝난 것 (TODO)

1. **VS Code 확장 실사용 확인** — Extension Development Host는 띄워봤지만 사용자가 실제로
   "Slacker: Open Chat" 실행해서 로그인/메시지/링크클릭/테마매칭 확인을 안 한 상태.
2. **apps/mobile** — 이 환경에서 검증 불가, 나중에 Android Studio 있는 환경에서.
3. **electron-builder 패키징** — `electron-builder.config.json`은 스캐폴딩만 있고 실제 설치파일
   빌드는 한 번도 안 해봄.
4. **VS Code 확장 `.vsix` 패키징/마켓플레이스 배포** — 안 함.
5. ~~자동화 테스트 스위트 없음~~ — **이번 세션에서 Phase 1(core+server) 완료**, 위 섹션 참고.
   Phase 2(ui 컴포넌트, postgres store, CI)는 아직 안 함.

## 지금 진행하려던 작업: 실제 계정 시스템 (다음 세션에서 이어갈 것)

사용자가 "실제 계정 시스템 추가" + "Supabase 인증 시스템" + "Render 배포"를 언급하며 논의
중이었음. **아직 최종 결정 안 됨** — 다음 세션에서 아래 질문들부터 사용자에게 다시 확인할 것.

이번 세션에서 두 경로(Supabase vs 자체구축)를 각각 구체적 파일 변경안으로 설계해서 에이전트로
정리해둠(대화에만 있고 별도 파일로 저장은 안 했음 — 필요하면 다음 세션에서 사용자에게 다시
요청해서 재생성). 결론은 **자체구축(Path A) 권장**:
- `ARCHITECTURE.md`의 "BaaS 안 쓴다"가 소프트 선호가 아니라 명시된 전제
- 이미 있는 Postgres 연결 패턴(`postgresMessageStore.ts`)·JWT 발급/검증(`jose`)을 그대로 재사용
  가능 — `users` 테이블 하나 추가하는 정도의 증분 작업
- `node:crypto.scrypt`로 새 의존성 없이 비번 해싱 가능(이 프로젝트가 지금까지 보여온 "내장 모듈
  우선" 패턴과 일치, `node:sqlite` 선택 때와 동일한 논리)
- Supabase는 "인증만 위임"해도 `auth.users`와 우리 메시지 데이터 모델이 분리되는 identity split이
  생김 — OAuth·비번 재설정 이메일 같은 실제 니즈가 없으면 실익이 적음
- Supabase가 유리해지는 경우: 구글/깃허브 OAuth, 비번 재설정 이메일이 필요하거나 "BaaS 안 쓴다"
  원칙을 완화해도 괜찮다면 — 그럴 땐 추천이 뒤집힘

공통 설계: `Message.author`는 스키마 변경 없이 "전송 시점 표시 이름 스냅샷"으로 유지(JWT `sub`는
안정적 유저 ID로 분리) — 개명해도 과거 메시지는 그대로, 매 읽기마다 유저 테이블 join 불필요.

### 결정해야 할 것
1. **인증 방식**: Supabase Auth (이메일/비밀번호/OAuth 검증된 구현체, 우리 서버는 Supabase가
   발급한 JWT만 검증) vs 자체 구축 (bcrypt/argon2 + 우리 Postgres에 직접 회원가입/로그인
   엔드포인트, ARCHITECTURE.md의 "BaaS 안 쓴다" 원칙 유지). **사용자는 Supabase 쪽으로 기우는
   눈치였음.**
2. **Supabase 환경**: 로컬(Supabase CLI, Docker — 계정 불필요, 지금 Postgres 하듯이) vs
   호스팅형(supabase.com 계정 필요, 실배포 염두에 둔 경우)
3. **배포**: Render(PaaS, WS 지속연결 지원, git push 배포)에 서버를 실제로 배포할 것인지. 배포한다면
   `render.yaml` 등 배포 설정 준비까지는 여기서 하되, 실제 Render 계정 생성/배포 실행은 사용자 몫.

### 이게 왜 아키텍처 문서와 부딪히는지
`docs/ARCHITECTURE.md`에 "백엔드는 BaaS가 아닌 자체 WebSocket 서버로 직접 구축한다"고 명시돼있음.
Supabase(Auth만이든 DB까지든)를 쓰면 이 원칙에서 벗어남 — "채팅 로직/WS 서버는 우리가 직접,
인증만 Supabase에 위임"으로 절충하면 완전히 어긋나진 않지만, 이 결정이 확정되면 ARCHITECTURE.md도
같이 업데이트해야 함 (전제 부분 수정 필요).

### 만약 Supabase+Render로 확정되면 예상 작업 순서
1. Supabase 프로젝트 준비 (로컬 CLI or 호스팅형 — 위 결정에 따라, 계정 필요하면 사용자가 직접)
2. `packages/core/src/protocol.ts`의 `LoginRequest/LoginResponse` 재설계 (비밀번호 필드, 이메일 등)
   — 또는 Supabase 클라이언트 SDK(`@supabase/supabase-js`)를 클라이언트 쪽에 직접 붙이고 우리
   REST `/auth/login`은 걷어내는 방식도 검토
3. `server/src/index.ts`의 `jose`로 직접 서명하던 JWT 검증 로직을 Supabase가 발급한 JWT 검증으로
   교체 (Supabase JWT secret 또는 JWKS 사용)
4. `messageStore`의 `DATABASE_URL`을 Supabase Postgres 연결 문자열로 전환 (기존 Postgres 경로
   그대로 재사용 가능한 부분 많음)
5. `@fastify/cors`의 `origin: true`를 실제 배포 도메인으로 좁히기
6. `docs/ARCHITECTURE.md` 갱신
7. 로그인/회원가입 UI (`packages/ui`의 `LoginForm` 등) 비밀번호 입력 등 반영해서 재설계
8. Render 배포 설정 준비, 배포 후 실제 검증

## 이 환경에서 배운 것 (다음 세션이 다시 겪지 않게)

- **`chcp` 관련**: Windows 콘솔이 기본 코드페이지라 한글 로그가 깨짐 — `execSync("chcp 65001")`을
  `win32`에서 시작 시 1회 실행하는 걸로 이미 해결해둠 (server, cli 둘 다).
- **`cap sync`(Capacitor Electron)는 신뢰 못 함** — 위 apps/desktop 항목 참고, 항상
  `pnpm --filter desktop sync` 스크립트 쓸 것.
- **`tasklist | grep -i electron`이 가끔 실제 프로세스를 놓침** — `tasklist //FI "IMAGENAME eq electron.exe"`
  쓰는 게 더 안정적이었음.
- **이 개발 환경(Claude Code 샌드박스)엔 Docker/psql/adb가 없음** — 하지만 **사용자의 실제 Windows
  머신에는 Docker Desktop이 설치돼 있고 켜면 정상 동작함** (Postgres 컨테이너 실제 검증 완료).
  Bash 툴은 사용자와 같은 머신에서 도는 것이라 `netstat`, `taskkill` 등으로 실제 프로세스 상태를
  확인/제어할 수 있음 — 단 `docker` CLI 자체는 Git Bash PATH에 안 잡혀서 직접 못 씀, 포트
  리스닝 여부(`netstat`)로 간접 확인.
- **Node 버전 v24, pnpm 워크스페이스** — `node:sqlite` 같은 실험적 내장 모듈도 문제없이 씀.
- **한글 커밋 메시지에서 백틱 조심** — bash `-m "..."` 안에 백틱(`` ` ``)이 들어가면 명령치환으로
  잘못 해석됨. heredoc 파일로 커밋 메시지 작성하는 습관 들일 것.

## 참고: 로컬 실행 방법

```sh
pnpm install
pnpm dev:server   # Fastify + WS, :8080 (SQLite 기본, DATABASE_URL 설정 시 Postgres)
pnpm dev:web      # Vite, :5173
pnpm dev:cli      # Ink 터미널 클라이언트
```

Postgres로 전환하려면 `server/`에서 `docker compose up -d` → `.env`에 `DATABASE_URL` 설정.
