import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplierDto } from './create-supplier.dto';
import { UpdateSupplierDto } from './update-supplier.dto';

// PR-149: email이 선택 필드인데도 프론트가 보내는 email: ''(빈 문자열)가
// @IsOptional() + @IsEmail() 조합에서 실제로는 거절당하던 버그의 회귀 방지.
// @IsOptional()은 값이 undefined/null일 때만 건너뛰므로, ''를 undefined로 바꾸는
// @Transform이 없으면 빈 문자열이 그대로 @IsEmail()에 걸린다.
describe('CreateSupplierDto — email 선택 입력 (PR-149)', () => {
  const emailErrors = (errors: Awaited<ReturnType<typeof validate>>) =>
    errors.find((e) => e.property === 'email')?.constraints ?? {};

  it('email을 아예 안 보내면(undefined) 통과한다', async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: '(주) 글로벌 자재' });
    const errors = await validate(dto);
    expect(emailErrors(errors)).toEqual({});
  });

  it('email이 빈 문자열이어도(프론트가 실제로 보내는 값) 통과한다', async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: '(주) 글로벌 자재', email: '' });
    const errors = await validate(dto);
    expect(emailErrors(errors)).toEqual({});
  });

  it('email 형식이 잘못되면 여전히 거절된다', async () => {
    for (const bad of ['abc', 'abc@']) {
      const dto = plainToInstance(CreateSupplierDto, { name: '(주) 글로벌 자재', email: bad });
      const errors = await validate(dto);
      expect(emailErrors(errors).isEmail).toBe('유효한 이메일 형식이 아닙니다.');
    }
  });

  it('유효한 email은 통과하고 값이 그대로 유지된다', async () => {
    const dto = plainToInstance(CreateSupplierDto, { name: '(주) 글로벌 자재', email: 'contact@globalmat.com' });
    const errors = await validate(dto);
    expect(emailErrors(errors)).toEqual({});
    expect(dto.email).toBe('contact@globalmat.com');
  });

  // PartialType(CreateSupplierDto)이므로 @Transform이 그대로 상속되는지 확인.
  it('UpdateSupplierDto도 email 빈 문자열을 통과시킨다', async () => {
    const dto = plainToInstance(UpdateSupplierDto, { email: '' });
    const errors = await validate(dto);
    expect(emailErrors(errors)).toEqual({});
  });

  it('UpdateSupplierDto도 잘못된 email 형식은 거절한다', async () => {
    const dto = plainToInstance(UpdateSupplierDto, { email: 'not-an-email' });
    const errors = await validate(dto);
    expect(emailErrors(errors).isEmail).toBe('유효한 이메일 형식이 아닙니다.');
  });
});
