# 03. 반복 오류 방지 체크리스트 (ERROR PREVENTION)

## 1. TypeScript & TypeORM 타입 방어 규칙
- `catch(err)` 블록에서 예외 객체 사용 시 반드시 `const error = err as Error;` 타입 캐스팅 적용.
- `queryRunner.manager.findOne(Inventory, ...)` 실행 시 결과가 null일 수 있으므로 `as Inventory | null` 명시.
- TypeORM 내 조회 조건 전달 시 `where: { itemId: id } as any` 형태 또는 엔티티 명세 필드만 사용하여 `EntityPropertyNotFoundError` 방지.

## 2. Passport / JWT 인증 규칙
- `AuthModule`과 `JwtStrategy`에서 사용하는 비밀키는 동일한 하드코딩 백업키(`'secretKey'`) 또는 동일 환경변수 사용 (`invalid signature` 방지).
- Public 라우트(로그인/회원가입)에는 컨트롤러 메서드 상단에 반드시 `@Public()` 데코레이터 부착.

## 3. 코드 분량 보존 규칙
- 파일 수정 시 일부 코드 생략(...) 금지.
- Swagger 데코레이터(`@ApiOperation`, `@ApiResponse`), Logger, 트랜잭션 구문은 항상 100% 보존.