# GEMINI.md (통합 Master Rules & Instructions)

본 문서는 NestJS, TypeORM, TypeScript 기반의 SCM 백엔드 및 React 프론트엔드 프로젝트 개발 시 준수해야 하는 통합 전역 규칙입니다. 모든 AI 어시스턴트 및 개발자는 본 지침을 엄격히 준수해야 합니다.

---

## 1. System Execution & Notification Rules (시스템 실행 및 알림 규칙)

- **순차 실행 (Task Chaining)**: 다단계 작업(Multi-step)은 반드시 한 번에 하나의 단계(Step)씩 순차적으로 실행합니다.
- **자동 진행 및 검증**: Step N 완료 후 파일 수정 결과를 스스로 검증하고, 문제가 없을 경우 자동으로 Step N+1을 진행합니다.
- **단일 파일 제약**: 한 번에 관련 없는 여러 파일을 동시에 대량 수정하지 않습니다.
- **작업 완료 자동 소리 알림 (Sound Notification)**: 요청받은 코드 수정, 분석, 또는 툴 실행이 마쳐질 때마다 답변 또는 작업의 맨 마지막에 아래 PowerShell 명령을 즉시 실행하여 사용자에게 완료 소리를 울립니다:
  ```bash
  powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"
  ```

---

## 2. 프로젝트 개요 (Project Overview)
- **프레임워크**: NestJS (v10)
- **ORM**: TypeORM
- **언어**: TypeScript
- **도메인**: SCM (공급망 관리) 백엔드 시스템
- **주요 모듈**:
  - 인증 (`src/auth/`)
  - 사용자 (`src/users/`)
  - 품목/아이템 (`src/items/`)
  - 재고 (`src/inventories/` - 복수형 필수)
  - BOM (`src/boms/` 또는 `src/items/entities/bom.entity.ts`)
  - 발주 (`src/purchase-orders/`)
  - 작업지시 (`src/work-orders/`)

---

## 3. 정적 타입 규칙 (Static Typing Rules)

TypeScript의 안정성을 최대한 활용하고, 컴파일 타임 에러 방지 및 런타임 예측 불가능한 예외를 방지하기 위해 다음 규칙을 엄격히 준수합니다.

### 3.1 예외 Catch 블록의 타입 방어
- `catch(err)` 블록에서 포착되는 예외 객체는 기본적으로 `unknown` 타입입니다. 이를 사용할 때는 반드시 안전하게 캐스팅하여 사용해야 합니다.
  ```typescript
  catch (err) {
    const error = err as Error;
    this.logger.error(error.message);
  }
  ```

### 3.2 TypeORM 조회 결과의 Null 방어
- `findOne`, `findOneBy` 등의 조회 메서드 실행 시 결과가 존재하지 않을 수 있으므로, 결과가 `null`일 수 있음을 명시하고 대응하는 방어 코드를 작성합니다.
  ```typescript
  const inventory = await queryRunner.manager.findOne(Inventory, { where: { id } }) as Inventory | null;
  if (!inventory) {
    throw new NotFoundException(`재고 정보를 찾을 수 없습니다 (ID: ${id})`);
  }
  ```

### 3.3 TypeORM Where 조건 객체 타입 매칭
- TypeORM 내 조회 조건을 전달할 때, 엔티티에 존재하지 않는 필드를 넘기면 `EntityPropertyNotFoundError`가 발생합니다. 엔티티 명세 필드만 사용하도록 정적 타입을 확인하고, 필요 시 명시적 타입을 부여하거나 안전하게 처리합니다.

### 3.4 타입 캐스팅 및 `any` 사용 제한
- 타입 시스템을 임의로 우회하는 무분별한 `any` 사용이나 `as any` 캐스팅은 엄격히 제한합니다. 컴파일러가 타입을 검증할 수 있도록 명확한 인터페이스, DTO, 엔티티 타입을 선언하여 사용합니다.

---

## 4. 에러 처리 가이드라인 (Error Handling Guidelines)

SCM 비즈니스 로직의 정합성을 보장하고, 클라이언트에 정확한 에러 응답을 전달하기 위해 일관된 에러 처리 규칙을 적용합니다.

### 4.1 NestJS 표준 예외(HttpException) 활용
- 비즈니스 로직 검증 실패 시, 알맞은 NestJS 표준 HTTP Exception을 발생시킵니다.
  - **비즈니스 조건 미충족 (예: 재고 부족, 잘못된 상태 전이 등)**: `BadRequestException` 사용.
  - **인증 및 권한 미흡**: `UnauthorizedException` 또는 `ForbiddenException` 사용.
  - **데이터 미존재**: `NotFoundException` 사용.

### 4.2 트랜잭션 관리와 에러 롤백 (QueryRunner)
- 복수 모듈의 데이터를 변경하는 비즈니스 트랜잭션(예: 발주 입고 시 재고 증가, 작업지시 완료 시 BOM 기반 자재 차감 등)은 반드시 TypeORM `QueryRunner`를 사용하여 트랜잭션 단위로 관리합니다.
- 예외 발생 시 반드시 `rollbackTransaction()`을 호출하고 `release()`로 커넥션을 반환해야 합니다.
  ```typescript
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    // 비즈니스 로직 수행
    // ...
    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err; // 상위 레이어로 예외 전파
  } finally {
    await queryRunner.release();
  }
  ```

### 4.3 비즈니스 로직 연동 예외 케이스
- **재고 차감 시 부족**: 완제품 생산 완료 시 BOM 기반 원자재 재고 차감 과정에서 재고가 부족할 경우, 반드시 `BadRequestException`을 발생시켜 트랜잭션을 롤백합니다.
- **발주 입고 완료**: 이미 완료되거나 취소된 발주(`RECEIVED`, `CANCELLED`)의 중복 입고 처리가 발생하지 않도록 상태 전이 유효성 검사를 수행하여 예외를 발생시킵니다.

---

## 5. 코드 보존 및 스타일 규칙 (Code Preservation & Style)

- **전체 코드 보존**: 코드를 수정할 때 임의로 기존 코드의 일부를 생략(`...` 또는 `// 기존 코드 동일`)하지 않고 전체 파일을 완전하게 작성 및 업데이트합니다.
- **Swagger 및 데코레이터 보존**: `@ApiOperation`, `@ApiResponse`, `@Get`, `@Post` 등 Swagger 관련 데코레이터 및 NestJS 구조 데코레이터를 임의로 누락하지 않고 보존합니다.
- **로깅 규칙**: 주요 비즈니스 흐름 및 에러 발생 지점에는 NestJS 내장 `Logger`를 사용하여 명확한 로그 메시지를 남깁니다.

---

## 6. Agent Execution Rules
1. Multi-step tasks must be executed sequentially one by one.
2. Complete Step N first, verify file updates, and then proceed to Step N+1 automatically without stopping.
3. Do not modify multiple unrelated files at once.
