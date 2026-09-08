# 배포 가이드 (Render / Railway)

이 프로젝트는 백엔드(NestJS)와 프론트엔드(React/Vite)가 각각 별도의 Dockerfile로 빌드되는
두 개의 독립 서비스로 배포된다. 두 서비스 모두 Render/Railway 같은 PaaS의 "Dockerfile 기반
배포"를 사용하며, 플랫폼 전용 설정 파일(render.yaml, railway.json 등)에 의존하지 않는다.

## 구성 요소

| 서비스 | 소스 | 배포 방식 |
|---|---|---|
| 백엔드 API | 루트 `Dockerfile` | Render Web Service / Railway Service (Dockerfile) |
| 프론트엔드 | `frontend-app/Dockerfile` | Render Web Service / Railway Service (Dockerfile, nginx로 정적 서빙) |
| 데이터베이스 | 관리형 Postgres (Neon, Render Postgres, Railway Postgres 등) | 별도 프로비저닝, 아래 마이그레이션 절차로 스키마 적용 |

로컬에서 세 구성 요소를 한 번에 띄워보려면 루트의 `docker-compose.yml`을 사용한다
(`docker compose up`). 이 compose 파일은 로컬 검증용이며, 실제 PaaS 배포는 각 서비스가
Dockerfile을 직접 빌드하는 방식이므로 compose 파일 자체를 배포에 사용하지 않는다.

## 1. 데이터베이스 준비

Render Postgres, Railway Postgres, Neon 등 관리형 Postgres 인스턴스를 하나 준비한다.
관리형 Postgres는 대부분 SSL 연결을 요구하므로 `DB_SSL=true`를 함께 설정해야 한다.

## 2. 백엔드 배포

- **빌드 방식**: Dockerfile (루트 `Dockerfile`)
- **포트**: 앱은 `process.env.PORT`를 읽는다 (`main.ts`). Render/Railway가 자동으로 주입하는
  `PORT` 값을 그대로 사용하면 되며, 별도로 맞출 필요는 없다 (없으면 3000).
- **환경 변수**: 아래 표 전체를 설정한다.

| 변수 | 설명 | 예시 |
|---|---|---|
| `DB_TYPE` | `postgres` (배포 환경은 항상 postgres) | `postgres` |
| `DB_HOST` | Postgres 호스트 | `ep-xxxx.aws.neon.tech` |
| `DB_PORT` | Postgres 포트 | `5432` |
| `DB_USERNAME` | Postgres 사용자 | `neondb_owner` |
| `DB_PASSWORD` | Postgres 비밀번호 | (시크릿으로 관리) |
| `DB_DATABASE` | 데이터베이스 이름 | `neondb` |
| `DB_SSL` | SSL 연결 여부 (관리형 Postgres는 대부분 `true` 필요) | `true` |
| `NODE_ENV` | `production`으로 설정해야 TypeORM `synchronize`가 꺼지고 마이그레이션으로만 스키마를 관리한다 | `production` |
| `JWT_SECRET` | JWT 서명 키 (강력한 랜덤 값, 반드시 시크릿으로 관리) | — |
| `JWT_EXPIRES_IN` | JWT 만료 시간 | `1h` |
| `GEMINI_API_KEY` | 작업지시서 AI 분석용 Gemini API 키 (미설정 시 목업 데이터로 동작) | — |
| `CORS_ORIGIN` | 허용할 프론트엔드 origin (콤마로 여러 개 구분 가능). 미설정 시 로컬 개발용 localhost 주소만 허용됨 | `https://scm-frontend.onrender.com` |

## 3. 프론트엔드 배포

- **빌드 방식**: Dockerfile (`frontend-app/Dockerfile`) — 멀티스테이지로 Vite 빌드 후 nginx로
  정적 파일을 서빙한다. `BrowserRouter`를 사용하므로 nginx 설정(`frontend-app/nginx.conf`)에
  SPA fallback(`try_files ... /index.html`)이 포함되어 있다.
- **빌드 인자**: `VITE_API_URL` — 백엔드 배포 URL을 빌드 타임에 주입해야 한다 (Vite는 런타임이
  아닌 빌드 타임에 env를 번들에 굽는다). Render/Railway의 "Docker Build Args" 설정에서
  `VITE_API_URL=https://<백엔드-배포-URL>`을 지정한다.
- 백엔드의 `CORS_ORIGIN`에 이 프론트엔드의 실제 배포 URL을 반드시 추가해야 로그인 등 API
  호출이 CORS에 막히지 않는다.

## 4. 최초 배포 시 마이그레이션 적용

`NODE_ENV=production`에서는 `synchronize`가 꺼져 있으므로, 백엔드가 처음 뜨는 것만으로는
테이블이 생기지 않는다. 배포 전(또는 배포 직후) 한 번은 마이그레이션을 직접 실행해 스키마를
만들어야 한다.

로컬 머신에서 배포 대상 DB를 가리키는 `.env`를 설정한 뒤 실행하는 것이 가장 간단하다:

```bash
# .env의 DB_HOST/DB_USERNAME/DB_PASSWORD/DB_DATABASE/DB_SSL이 배포 대상 DB를 가리키는지 확인
npm run migration:run
```

이후 엔티티가 바뀔 때마다:

```bash
npm run migration:generate -- src/migrations/<변경내용>
npm run migration:run
```

순서로 새 마이그레이션을 생성하고 적용한다. `synchronize`에 의존해 자동으로 스키마를 바꾸지
않는다 — 프로덕션 DB에서 검토 없는 스키마 변경은 사고 위험이 크기 때문이다.

## 5. 배포 후 점검

- 백엔드: `GET /api` (Swagger 문서)로 기동 확인
- 프론트엔드: 로그인 → 대시보드 → 작업지시서 업로드 흐름이 백엔드 API를 정상 호출하는지 확인
  (브라우저 개발자 도구 Network 탭에서 요청이 `VITE_API_URL`로 설정한 백엔드 주소로 나가는지,
  CORS 에러가 없는지 확인)
