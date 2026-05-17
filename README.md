# 청하람 QR 물류 추적 시스템

QR 코드 기반 물류 추적 및 소유권 관리 시스템입니다.

## 기능

- QR 코드 생성 및 관리
- QR 코드 스캔
- 이동 요청 및 승인
- 수령 확인
- 설치 완료 처리 (사진 업로드, GPS 저장)
- QR 타임라인 조회

## 기술 스택

- Next.js 14
- TypeScript
- TailwindCSS
- Supabase (데이터베이스, 인증, 스토리지)
- React QR Reader
- Lucide React (아이콘)

## 시작하기

### 1. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 환경 변수를 설정하세요:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. 의존성 설치

```bash
npm install
```

### 3. Supabase 데이터베이스 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/migrations/` 디렉토리의 SQL 파일들을 순서대로 실행합니다:
   - `001_initial_schema.sql`
   - `002_seed_data.sql`
   - `003_storage_buckets.sql`

3. Storage에 `installations` 버킷을 생성합니다 (마이그레이션 파일에 포함되어 있습니다).

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 열어 애플리케이션에 접속하세요.

## 프로젝트 구조

```
CHUNGHARAM/
├── app/                      # Next.js App Router
│   ├── api/                  # API 라우트
│   │   ├── qr/              # QR 관련 API
│   │   └── install/         # 설치 관련 API
│   ├── auth/                # 인증 관련
│   ├── dashboard/           # 대시보드
│   ├── install/             # 설치 페이지
│   ├── login/               # 로그인 페이지
│   ├── qr/                  # QR 관련 페이지
│   ├── transfer/            # 이동 요청 페이지
│   ├── globals.css          # 전역 스타일
│   ├── layout.tsx           # 루트 레이아웃
│   └── page.tsx             # 메인 페이지
├── lib/                     # 유틸리티 라이브러리
│   ├── supabase.ts          # Supabase 클라이언트
│   ├── supabase-server.ts   # Supabase 서버 클라이언트
│   └── supabase-middleware.ts # Supabase 미들웨어
├── supabase/               # Supabase 관련 파일
│   ├── migrations/         # 데이터베이스 마이그레이션
│   └── schema.sql          # 데이터베이스 스키마
├── public/                 # 정적 파일
├── package.json            # 프로젝트 의존성
├── tsconfig.json           # TypeScript 설정
├── tailwind.config.ts      # TailwindCSS 설정
└── next.config.js          # Next.js 설정
```

## API 엔드포인트

### QR 관련

- `POST /api/qr/create` - QR 코드 생성
- `GET /api/qr/:id` - QR 상세 조회
- `POST /api/qr/transfer` - QR 이동 요청
- `POST /api/qr/transfer/approve` - QR 이동 승인/거절
- `POST /api/qr/transfer/receive` - QR 수령 확인

### 설치 관련

- `POST /api/install` - 설치 완료 처리

### 인증 관련

- `GET /auth/callback` - 인증 콜백

## 권한 시스템

### 조직 타입

- `super_admin` - 슈퍼 관리자
- `hq` - 본사
- `branch` - 지사
- `office` - 영업점
- `employee` - 사원

### QR 상태

- `ACTIVE` - 활성 상태
- `PENDING` - 이동 대기 중
- `APPROVED` - 이동 승인됨
- `RECEIVED` - 수령 확인됨
- `INSTALLED` - 설치 완료
- `SETTLED` - 정산 완료
- `REJECTED` - 거절됨
- `LOCKED` - 잠김

## 보안

- Row Level Security (RLS)를 사용하여 데이터 접근 제어
- 사용자 역할에 따른 권한 분리
- API 라우트에서 인증 및 권한 확인

## 배포

이 프로젝트는 Vercel에 배포하기에 적합합니다:

1. GitHub에 코드를 푸시합니다.
2. Vercel에 프로젝트를 연결합니다.
3. 환경 변수를 설정합니다.
4. 배포합니다.

## 라이선스

이 프로젝트는 청하람을 위해 개발되었습니다.
