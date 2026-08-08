import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // 1. 사용자 생성 (Create)
  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('이미 존재하는 이메일 주소입니다.');
    }

    const user = this.userRepository.create(createUserDto);
    return await this.userRepository.save(user);
  }

  // 2. 전체 사용자 조회 (Read All)
  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // 3. 단일 사용자 조회 (Read One)
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`ID가 ${id}인 사용자를 찾을 수 없습니다.`);
    }
    return user;
  }

  // 4. 사용자 정보 수정 (Update)
  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id); // 존재 여부 검증

    // 이메일 변경 시 중복 검사
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingUser) {
        throw new ConflictException('이미 사용 중인 이메일 주소입니다.');
      }
    }

    Object.assign(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  // 5. 사용자 삭제 (Delete)
  async remove(id: number): Promise<{ message: string }> {
    const user = await this.findOne(id); // 존재 여부 검증
    await this.userRepository.remove(user);
    return { message: `ID ${id} 사용자 삭제가 완료되었습니다.` };
  }
}