import * as fs from 'fs';
import * as path from 'path';

// PR-199: "하네스가 DB에 접속하는 코드 경로가 없음을 테스트(모듈 import 그래프)로
// 확인"한다 — scripts/vision-eval/ 아래 모든 .ts 파일의 import 문을 정적으로 읽어서,
// TypeORM/AppModule/DataSource/@nestjs/typeorm 같은 DB 관련 모듈을 import하는 파일이
// 하나도 없는지 확인한다. vision.service.ts는 ConfigService만 받는 생성자라 예외로
// import를 허용한다(DB 레포지토리를 쓰지 않음).
const FORBIDDEN_PATTERNS = [
  /from ['"]typeorm['"]/,
  /from ['"]@nestjs\/typeorm['"]/,
  /from .*app\.module['"]/,
  /from .*data-source['"]/,
  /DataSource/,
  /TypeOrmModule/,
  /InjectRepository/,
];

function listTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) return [full];
    return [];
  });
}

describe('하네스 DB 미접속 보장 (PR-199)', () => {
  const files = listTsFiles(__dirname);

  it('scripts/vision-eval/ 아래 어떤 파일도 TypeORM/DataSource/AppModule을 import하지 않는다', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      // 주석 설명(DB에 안 붙는다는 취지의 코멘트)까지 걸리지 않게 실제 import/require
      // 구문 라인만 검사한다.
      const importLines = lines.filter((l) => /^\s*import\s|require\(/.test(l));
      if (importLines.some((l) => FORBIDDEN_PATTERNS.some((p) => p.test(l)))) {
        offenders.push(path.relative(__dirname, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('model-runner.ts는 vision.service.ts만 참조하고(Nest 앱 전체를 띄우지 않음) Controller/Module을 import하지 않는다', () => {
    const content = fs.readFileSync(path.join(__dirname, 'model-runner.ts'), 'utf8');
    expect(content).toContain("from '../../src/sales-orders/vision.service'");
    expect(content).not.toMatch(/Controller|@Module\(/);
  });
});
