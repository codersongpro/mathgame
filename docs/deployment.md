# Bubble Semble 배포·롤백 안내

## 1. 환경 분리 원칙

| Git 브랜치 | Vercel 웹 | Cloudflare 실시간 서버 | 용도 |
|---|---|---|---|
| `codex/**`, 기능 브랜치, PR | Preview | `bubble-semble-realtime-preview` | 교사·개발자 사전 확인 |
| `main` | Production | `bubble-semble-realtime-production` | 학생 실제 사용 |

Preview 웹에는 반드시 Preview 실시간 주소를, Production 웹에는 반드시 Production 실시간 주소를 연결합니다. Preview 웹과 Production 실시간 방을 섞으면 시험 플레이가 실제 수업방에 들어갈 수 있으므로 금지합니다.

## 2. 저장소 비밀 이름

값은 문서나 YAML에 쓰지 않고 GitHub/Vercel/Cloudflare의 암호화된 비밀 저장소에만 넣습니다.

| 이름 | 저장 위치 | 용도 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions 또는 Cloudflare | Worker 배포 권한 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions 또는 Cloudflare | 배포 계정 식별 |
| `VERCEL_TOKEN` | GitHub Actions를 통한 CLI 배포 시에만 | Vercel CLI 인증 |
| `VERCEL_ORG_ID` | GitHub Actions를 통한 CLI 배포 시에만 | Vercel 팀 식별 |
| `VERCEL_PROJECT_ID` | GitHub Actions를 통한 CLI 배포 시에만 | Vercel 프로젝트 식별 |

`NEXT_PUBLIC_REALTIME_URL`은 공개 브라우저 주소이므로 비밀은 아니지만 환경별로 반드시 분리합니다. 값은 끝의 `/room`을 제외한 `wss://...workers.dev` 형식입니다.

## 3. 최초 Vercel 연결

1. Vercel에서 `codersongpro/mathgame` 저장소를 가져옵니다.
2. 프로젝트 이름은 `bubble-semble-web`로 정합니다.
3. Root Directory는 `apps/web`으로 설정합니다.
4. Production Branch는 `main`으로 설정합니다.
5. Preview 환경의 `NEXT_PUBLIC_REALTIME_URL`에는 Preview Worker 주소를 넣습니다.
6. Production 환경에는 Production Worker 주소를 별도로 넣습니다.
7. 저장소의 기능 브랜치를 push하면 Vercel이 Preview URL을 만듭니다.

## 4. 안전한 배포 순서

다음 순서를 바꾸지 않습니다.

1. `pnpm test`
2. `pnpm typecheck`
3. `pnpm build`
4. Cloudflare Preview 배포
5. Vercel Preview 배포
6. 브라우저 태블릿 화면과 10인 부하 검증
7. 검증된 Preview만 `main`에 병합

Cloudflare Preview 배포 명령:

```powershell
pnpm.cmd --filter @bubble-semble/realtime deploy:preview
```

Production 배포는 Preview 검증과 승인 뒤에만 실행합니다.

```powershell
pnpm.cmd --filter @bubble-semble/realtime deploy:production
```

## 5. 롤백

### Vercel

Vercel 대시보드의 Deployments에서 직전 정상 배포의 메뉴를 열고 **Promote to Production**을 선택합니다. CLI가 연결된 환경에서는 다음 명령으로도 되돌릴 수 있습니다.

```powershell
vercel rollback <직전-정상-배포-URL>
```

### Cloudflare

Cloudflare 대시보드의 Workers & Pages → 해당 Worker → Deployments에서 직전 정상 버전을 선택해 Rollback 합니다. CLI 사용 시 먼저 버전 목록을 확인한 뒤 정상 버전을 지정합니다.

```powershell
wrangler versions list --env production
wrangler versions rollback <정상-버전-ID> --env production
```

롤백 뒤에는 웹이 가리키는 `NEXT_PUBLIC_REALTIME_URL`이 같은 환경인지 다시 확인하고, 새 방 코드로 2인 접속을 먼저 확인합니다.
