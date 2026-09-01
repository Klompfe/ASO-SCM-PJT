import { Test, TestingModule } from '@nestjs/testing';
import { StandardDataProcessingService } from './standard-data-processing.service';
import { DataSource } from 'typeorm';

describe('StandardDataProcessingService', () => {
  let service: StandardDataProcessingService;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandardDataProcessingService,
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                findOneBy: jest.fn(),
                create: jest.fn(),
                save: jest.fn(),
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StandardDataProcessingService>(StandardDataProcessingService);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
