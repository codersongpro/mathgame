# Bubble Semble — 다른 PC에서 이어하기

2026-09-28 기준 인수인계 문서입니다. **작업 기준 브랜치는 `codex/bubble-semble-phase-2`**입니다. `main`은 이전 단계에 머물러 있으므로, 다른 PC에서 `main`을 열고 이어서 수정하지 마세요. 9월 28일 교사 기능 변경은 현재 PC에만 있으며, GitHub 브랜치에는 아직 반영하지 않았습니다.

## 1. 현재까지 확인된 상태

- `main`: 10인 실시간 같은 맵, 태블릿 이동·점프, 재접속, 인원 구간별 맵의 기반 단계입니다.
- `codex/bubble-semble-phase-2`: 서버 판정 거품 발사·포획·협동 팡, 태블릿 전투 버튼, **6자리 숫자 방 코드 입력**이 추가됐습니다.
- 현재 PC에서는 교사가 접속키로 방을 열면 서버가 숫자 6자리를 발급하도록 바꿨습니다. 미발급 방 입장은 거절되고, 교사 모니터는 방별 토큰으로 보호됩니다. **이 변경은 아직 Preview·운영 환경에 배포하지 않았습니다.**
- 거품 전투는 2인 브라우저 플레이와 단위·서버·웹 테스트로 확인했습니다. 이후 6자리 방 코드 변경은 로컬 브랜치에 커밋됐습니다. 다른 PC에서 재검증하세요.
- 그래픽 생성 프롬프트는 [`docs/assets/bubble-semble-graphics-prompts.md`](docs/assets/bubble-semble-graphics-prompts.md)에 있고, 루미 시드 이미지만 일부 있습니다. 전체 완성형 그래픽은 아직 없습니다.
- 저장소에 학생 실명, 성적, 교사 비밀키를 넣지 않았습니다. 현재 장기 학습 기록 저장 기능도 없습니다.

## 2. 새 PC에서 시작

Windows PowerShell 기준입니다. Git, Node.js 24, pnpm 11.19.0을 준비한 뒤 실행합니다.

```powershell
git clone --branch codex/bubble-semble-phase-2 https://github.com/codersongpro/mathgame.git
cd mathgame
git status --short --branch
```

이미 저장소를 받아둔 PC라면 `git fetch origin` 후 `git switch --track origin/codex/bubble-semble-phase-2`로 작업 브랜치를 만듭니다. 이미 같은 이름의 로컬 브랜치가 있다면 `git switch codex/bubble-semble-phase-2`를 사용하고, 먼저 `git status`로 로컬 변경을 확인합니다.

의존성이 없는 새 PC에서는 잠금 파일 기준으로 한 번만 설치합니다. PowerShell에서 `pnpm` 실행이 막히면 아래처럼 `.cmd` 명령을 사용합니다.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd test
pnpm.cmd typecheck
```

로컬 웹·실시간 서버를 실행할 때는 각각 별도 터미널에서 `pnpm.cmd dev:web`, `pnpm.cmd dev:realtime`을 사용합니다. 웹 앱의 로컬 실시간 주소는 `.env.example`을 참고해 `apps/web/.env.local`의 `NEXT_PUBLIC_REALTIME_URL=ws://127.0.0.1:8787`로 설정합니다. `.env.local`과 비밀키는 Git에 올리지 않습니다.

## 3. 가장 먼저 이어갈 기능

교사가 비밀키로 **방 열기**를 누르면 서버가 6자리 숫자 코드를 발급하고, 학생은 코드만 입력해 입장합니다. 교사는 별도 화면에서 접속자와 팀 활동을 확인합니다. 코드와 관련 테스트는 현재 PC에 구현돼 있습니다. 상세 설계와 검증 기준은 [`교사 방 자동 발급·모니터링 계획`](docs/superpowers/plans/2026-09-23-teacher-room-monitoring.md)에 있습니다.

`TEACHER_CREATE_KEY`는 Preview 검증 시 Cloudflare Secret에만 등록합니다. 값은 코드·문서·채팅에 기록하지 않습니다. 학생용 6자리 번호만으로 교사 화면에 접근할 수 없어야 합니다. Worker 통합 테스트와 웹 테스트·타입 검사·빌드를 통과했고, 로컬 브라우저에서 교사 방 발급→학생 2명 입장→교사 현황 갱신과 새로고침 복구를 확인했습니다. 실제 Preview 환경은 아직 검증하지 않았습니다.

다음 순서는 **Preview에서 교사 방 생성→학생 입장→교사 현황을 검증**한 뒤, [페이즈 2 계획](docs/superpowers/plans/2026-09-23-bubble-semble-phase-2.md)의 개인 계산 문제 → 친구 구출과 일반 스테이지 1개 완성입니다. 이후 전체 범위는 [제품 설계 명세](docs/superpowers/specs/2026-09-22-bubble-semble-design.md)를 따릅니다.

## 4. 이후 남은 작업

1. 학생별 수학 문제와 서버 정답 판정, 태블릿 터치 답변
2. 인원별 몬스터·문제 조절, 친구 구출, 첫 스테이지 종료·결과
3. 일반 스테이지 3개와 보스 1개, 약 10분 세트, 팀 타임어택과 다음 난이도
4. 초등 1~6학년 콘텐츠, 사칙연산, 1~19단 복수 선택, 다양한 수학 개념
5. 개인 성장 기록·배지·랭크와 교사 학급 요약, 보스 기록 저장
6. 레트로 픽셀 에셋·음악·효과음, 접근성·10인 성능·보안 검증

학생별 장기 기록을 추가하기 전에는 권한, 암호화, 보존·삭제 정책을 먼저 정합니다.

## 5. 배포 경계

- 이 브랜치를 GitHub에 올리는 것은 **다른 PC로 작업을 옮기기 위한 것**입니다. `main` 병합이나 Cloudflare Production 배포를 의미하지 않습니다.
- 기능 브랜치 push 시 GitHub 검증 및 Vercel Preview가 실행될 수 있습니다. Preview 웹과 Preview Worker는 서로 맞는 버전으로 따로 확인해야 합니다.
- 운영 Vercel·Cloudflare 배포는 사용자가 직접 진행합니다. 환경 분리와 순서는 [`docs/deployment.md`](docs/deployment.md)를 확인하세요.

다른 PC에서 9월 28일 교사 기능까지 이어가려면, 먼저 이 PC의 변경을 GitHub 브랜치에 반영해야 합니다. 그전까지 GitHub에서 복제한 코드는 9월 23일 인수인계 상태입니다.
