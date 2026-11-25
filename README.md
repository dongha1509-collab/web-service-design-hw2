# 과제 2 - 신청·승인 서비스

행사 신청, 대기 취소, 직접 승인, 승인 취소와 대기자 자동 승급, 변경 이력을 구현한 서비스입니다.

AI 사용 요약: 설계 검토, 코드와 문서 초안 작성에 AI를 사용했습니다. 적용 위치와 직접 수정·검증한 내용은 보고서 7장에 있습니다.

**보고서와 검증 증거:** [docs/report.pdf](docs/report.pdf) · [docs/evidence/](docs/evidence/)

1. 실행

- Node.js 24.x 필요합니다

cd starter
npm ci
npm test
npm start
접속: http://127.0.0.1:3000

2. DB 초기화

서버 종료 후 npm run db:reset -> RESET입력 -> npm start 순으로 DB 초기화를 진행합니다.

3. 계정

학생 alice·bob·charlie, 운영자 manager1(행사 1)·manager2(행사 2), 비밀번호 Classroom123!

4. 테스트

- `npm test` : 기반 테스트 4건
- `npm run test:assignment` : 필수 T01~T32

5. 구현내용

- `src/application-service.js` : TODO-01~04 (apply, cancel, approve, revoke), 내부 도우미
- `src/repository.js` : `nextPending`, `transaction` 추가
- 나머지 파일은 제공 코드 그대로

구현 완료. 테스트 결과와 화면 검증은 보고서 3~7장 참조.

6. 제출물

- 소스 + `package-lock.json`
- 보고서: `docs/report.pdf`
