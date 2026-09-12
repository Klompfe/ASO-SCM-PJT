import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';

// PR-072: register()의 사전 중복 검사(findOne)와 실제 INSERT(save) 사이에는 시간차가
// 있어, 동시에 같은 이메일로 두 요청이 들어오면 검사를 둘 다 통과한 뒤 나중에 실행되는
// save()가 DB unique 제약(username/email)에 걸려 실패할 수 있다(TOCTOU race). 실제
// 동시 요청으로 재현해보면 SQLite 테스트 DB의 파일 락 특성상 결과가 들쭉날쭉해
// e2e에서는 신뢰성 있게 검증하기 어려워, save()가 unique 제약 위반 에러를 던지는
// 상황을 목으로 직접 재현해 catch 블록이 이를 500이 아닌 409(ConflictException)로
// 정확히 변환하는지 여기서 결정적으로 검증한다.
describe('AuthService', () => {
  let service: AuthService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn((payload: any) => payload),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserRepository.create.mockImplementation((payload: any) => payload);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register() - 중복 가입 처리 (PR-072)', () => {
    it('사전 중복 검사(findOne)에서 기존 사용자가 발견되면 ConflictException(409)을 던지고 save()는 호출하지 않아야 한다', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 1, email: 'dup@test.com' });

      await expect(
        service.register({ email: 'dup@test.com', password: 'password123!', name: 'Dup' }),
      ).rejects.toThrow(ConflictException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('사전 검사는 통과했지만 save()가 Postgres unique 제약 위반(code 23505)을 던지면 500이 아닌 ConflictException(409)으로 변환해야 한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(null); // 사전 검사 통과(race의 다른 한쪽)
      mockUserRepository.save.mockRejectedValue({ code: '23505', message: 'duplicate key value' });

      await expect(
        service.register({ email: 'race@test.com', password: 'password123!', name: 'Race' }),
      ).rejects.toThrow(ConflictException);
    });

    it('save()가 SQLite unique 제약 위반(code SQLITE_CONSTRAINT)을 던져도 동일하게 ConflictException(409)으로 변환해야 한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockRejectedValue({
        code: 'SQLITE_CONSTRAINT',
        message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email',
      });

      await expect(
        service.register({ email: 'race-sqlite@test.com', password: 'password123!', name: 'Race' }),
      ).rejects.toThrow(ConflictException);
    });

    it('unique 제약과 무관한 다른 에러는 여전히 InternalServerErrorException(500)이어야 한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.register({ email: 'other-error@test.com', password: 'password123!', name: 'Other' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('정상 가입 시 비밀번호 필드를 제외하고 반환해야 한다', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue({
        id: 1,
        email: 'good@test.com',
        username: 'good@test.com',
        password: 'hashed-password',
      });

      const result = await service.register({
        email: 'good@test.com',
        password: 'password123!',
        name: 'Good',
      });

      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('good@test.com');
    });
  });
});
