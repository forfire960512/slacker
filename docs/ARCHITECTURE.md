# 아키텍처 개요

"어디서든 되는 채팅 프로그램" — VSCode 확장 / 터미널(CLI) / 웹페이지 / 앱(데스크톱+모바일) 4곳에서
모두 동작하는 채팅 클라이언트를 하나의 소스코드 기반(모노레포)으로 유지보수하기 위한 설계.

## 전제

- **콘텐츠는 텍스트 전용.** 메시지는 순수 텍스트이고, 링크는 클릭하면 열리는 정도만 지원한다.
  이미지/파일 미리보기, 리치 임베드 등은 스코프 밖. 이 제약 덕분에 터미널까지 포함한 전 플랫폼의
  UI 재사용률이 크게 올라간다.
- 백엔드는 BaaS가 아닌 자체 WebSocket 서버로 직접 구축한다.
- 전체 스택은 Rust 없이 순수 JS/TypeScript로 통일한다 (데스크톱/모바일은 Tauri 대신 Capacitor 사용).

## 결론

**"글자 그대로 코드 100% 동일"은 불가능하지만, 계층을 나누면 70~95%까지 공유 가능하다.**
Slack, Discord, Linear 등이 실제로 쓰는 방식과 동일한 패턴이다. VSCode 확장의 Webview,
Capacitor 데스크톱/모바일, 웹페이지는 전부 "OS 웹뷰" 기반이라 UI까지 거의 동일한 코드로
재사용되고, 터미널만 별도 렌더러가 필요하다.

| 계층 | 웹 | 데스크톱 | VSCode | 모바일 | 터미널 |
|---|---|---|---|---|---|
| 핵심 로직 (상태/네트워킹/프로토콜) | ✅ | ✅ | ✅ | ✅ | ✅ (~95% 공유) |
| UI 컴포넌트 | ✅ | ✅ (~95%) | ✅ (~90%) | ✅ (~95%, Capacitor가 웹 빌드를 그대로 로드) | ❌ (렌더러는 별도, 텍스트+링크뿐이라 재작성 비용은 매우 작음) |

텍스트 전용이라는 제약 덕분에 터미널 쪽 단점(리치 콘텐츠 불가)이 애초에 문제가 되지 않는다.
링크는 대부분의 현대 터미널(Windows Terminal, iTerm2, VSCode 내장 터미널 등)이 지원하는
ANSI OSC 8 하이퍼링크 이스케이프로 "클릭 가능한 링크"를 그대로 구현할 수 있다.

## 모노레포 구조

```
repo/
├─ packages/
│  ├─ core/              # 프로토콜, 메시지 모델, WS 클라이언트, 인증, 상태(zustand) — 순수 TS, 플랫폼 무관
│  └─ ui/                # React + Tailwind 컴포넌트 (DOM 기반 — 웹/데스크톱/VSCode 공용)
├─ apps/
│  ├─ web/                # Vite+React 웹 클라이언트 (기준 빌드)
│  ├─ desktop/             # Capacitor Electron — apps/web 빌드를 감싸는 얇은 쉘 (순수 JS/TS, Rust 불필요)
│  ├─ mobile/               # Capacitor iOS/Android — 같은 웹 빌드를 OS 내장 웹뷰(WKWebView/Android WebView)로 로드
│  ├─ vscode-extension/      # 확장 호스트(Node) + Webview 패널에 apps/web 빌드 로드
│  └─ cli/                    # Ink(React reconciler for terminal) — core만 재사용, UI는 새로 작성
└─ server/                     # Node.js(Fastify+ws) WebSocket 서버, Postgres 영속화
```

### 각 구성요소

- **packages/core**: 메시지 송수신, 재연결, 인증, 상태관리를 순수 TS로 구현. 브라우저/Node/webview
  어디서든 동일하게 동작한다.
- **packages/ui**: React 컴포넌트. DOM이 있는 곳(웹, Capacitor, VSCode webview)에서 그대로 재사용된다.
- **apps/desktop, apps/mobile**: Capacitor 사용. Capacitor는 Tauri처럼 OS 내장 웹뷰(Chromium 번들링
  없음)를 쓰지만 Rust 대신 순수 JS/TS 툴체인(npm 플러그인 생태계)이라 학습 비용이 낮다. 데스크톱은
  `@capacitor-community/electron`으로, 모바일(iOS/Android)은 Capacitor 코어로 커버 — 둘 다 apps/web
  빌드를 그대로 로드한다. 네이티브 기능(알림, 파일시스템 등)이 필요하면 Capacitor 플러그인으로 추가한다.
- **apps/vscode-extension**: 확장 자체는 Node 확장 호스트에서 실행되고, 실제 채팅 UI는 Webview
  (=임베디드 크로미움)에 apps/web에서 만든 React 빌드를 그대로 로드한다 — 새로 짤 필요 없이 기존
  빌드 산출물을 재사용한다. extension host와는 `postMessage`로 통신(파일시스템/설정 접근 등 VSCode
  API가 필요한 부분만). CSP 제약으로 리소스 로딩 경로(`webview.asWebviewUri`)와 nonce 설정만 손보면
  된다. GitLens, GitHub Copilot Chat 등 다수 확장이 이 패턴을 사용 중이라 검증된 방식이다.
- **apps/cli**: Ink로 터미널 UI를 구현한다. DOM이 없으므로 렌더러 컴포넌트(Box/Text)는 새로
  작성하지만, core의 상태/네트워킹 훅은 그대로 가져다 쓴다. 텍스트+링크만 다루므로 컴포넌트 수가
  적어(메시지 리스트, 입력창 정도) 재작성 비용이 매우 낮다. 링크는 OSC 8 이스케이프로 클릭 가능하게
  렌더링한다.
- **server/**: 직접 구축하는 WebSocket 서버. 메시지 브로드캐스트/영속화/인증(JWT)을 담당한다.
  클라이언트 쪽 core는 이 서버와만 통신하므로 프로토콜만 고정하면 5개 클라이언트(웹/데스크톱/
  모바일/VSCode/CLI) 모두 동일하게 붙는다.

## 주요 리스크 / 유의점

1. VSCode Webview는 CSP가 엄격해서 웹 빌드 산출물을 `webview.asWebviewUri` 스킴에 맞게 후처리해야
   한다.
2. Capacitor 모바일에서 WebSocket이 백그라운드/화면 꺼짐 상태에서 끊기는 이슈가 있다 — 앱 복귀 시
   재연결 로직을 core에 반드시 포함해야 한다.
3. 웹소켓 재연결/오프라인 처리 로직은 반드시 core에 공통화한다 (플랫폼별로 따로 구현하면 공유
   이점이 사라진다).
4. 콘텐츠가 텍스트+링크로 고정되어 있어 터미널 클라이언트의 기능 축소 이슈는 없다 — core의 메시지
   모델도 `{ text, links[] }` 정도로 단순하게 고정할 수 있다.

## 빌드 순서

1. `packages/core`의 메시지 프로토콜 + WebSocket 서버 스펙 먼저 확정
2. `apps/web`으로 UI/UX 검증 (server ↔ web 세로 슬라이스)
3. `apps/desktop`(Capacitor Electron) → `apps/vscode-extension` 순으로 웹뷰 재사용 확장
4. `apps/mobile`, `apps/cli`는 core가 안정화된 이후 착수
