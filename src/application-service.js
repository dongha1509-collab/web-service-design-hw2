import { AppError, missing, forbidden, invalidState } from './errors.js';

// 업무 규칙과 트랜잭션 구현. docs/API.md의 검사 순서를 따릅니다.
// 존재(404) → 권한(403) → 현재 상태(409) → 정원(409) → 저장.
// actor는 검증된 로그인 사용자입니다. repo의 저장 함수는 권한을 검사하지 않으므로 여기서 판단합니다.
// 모든 조회·검사·저장은 repo.transaction 안에서 수행합니다.
// - 검사도 트랜잭션 안에서 하므로 매 요청마다 최신 DB 상태를 기준으로 판단합니다(R8).
// - 거부(AppError)나 저장 오류가 나면 ROLLBACK되어 상태·이력이 요청 전과 같습니다(R7).
const alreadyApplied = () => new AppError(409,'ALREADY_APPLIED','이미 이 행사에 신청한 기록이 있습니다.');
const capacityFull = () => new AppError(409,'CAPACITY_FULL','승인 정원이 모두 찼습니다.');

export function createApplicationService(repo) {
  // 담당 운영자 여부: MANAGER 역할이면서 행사의 manager_id와 같은 사용자
  const isManagerOf = (actor,event) => actor.role==='MANAGER' && event.managerId===actor.id;

  // 신청을 찾고, 없으면 404. 행사 정보도 함께 반환합니다.
  function loadApplication(applicationId) {
    const application=repo.application(applicationId);
    if(!application) throw missing('신청');
    return { application, event: repo.event(application.eventId) };
  }

  return {
    // TODO-01: 신청 → PENDING + APPLY 이력
    apply(actor,eventId) {
      return repo.transaction(() => {
        const event=repo.event(eventId);
        if(!event) throw missing('행사');
        if(actor.role!=='STUDENT') throw forbidden();
        // CANCELLED·REVOKED 기록도 중복으로 봅니다(R2). UNIQUE 제약 위반(500) 전에 409로 거부합니다.
        if(repo.existing(event.id,actor.id)) throw alreadyApplied();
        const created=repo.insert(event.id,actor.id);
        repo.addHistory({ applicationId:created.id, actorId:actor.id, action:'APPLY', fromStatus:null, toStatus:'PENDING' });
        return created;
      });
    },

    // TODO-02: 본인의 PENDING → CANCELLED + CANCEL 이력. 자동 승급 없음.
    cancel(actor,applicationId) {
      return repo.transaction(() => {
        const { application } = loadApplication(applicationId);
        if(actor.role!=='STUDENT' || application.userId!==actor.id) throw forbidden();
        if(application.status!=='PENDING') throw invalidState();
        const updated=repo.setStatus(application.id,'CANCELLED');
        repo.addHistory({ applicationId:application.id, actorId:actor.id, action:'CANCEL', fromStatus:'PENDING', toStatus:'CANCELLED' });
        return updated;
      });
    },

    // TODO-03: 담당자의 직접 승인. PENDING → APPROVED + APPROVE 이력. 정원 초과 시 409.
    approve(actor,applicationId) {
      return repo.transaction(() => {
        const { application, event } = loadApplication(applicationId);
        if(!isManagerOf(actor,event)) throw forbidden();
        if(application.status!=='PENDING') throw invalidState();
        // APPROVED만 정원에 포함합니다(R4).
        if(repo.approvedCount(event.id)>=event.capacity) throw capacityFull();
        const updated=repo.setStatus(application.id,'APPROVED');
        repo.addHistory({ applicationId:application.id, actorId:actor.id, action:'APPROVE', fromStatus:'PENDING', toStatus:'APPROVED' });
        return updated;
      });
    },

    // TODO-04: 승인 취소 + 대기자 1명 자동 승급. 신청 2건 + 이력 2건을 한 트랜잭션으로 처리합니다.
    // reason은 app.js에서 trim·5~200자 검사를 마친 값입니다.
    revoke(actor,applicationId,reason) {
      return repo.transaction(() => {
        const { application, event } = loadApplication(applicationId);
        if(!isManagerOf(actor,event)) throw forbidden();
        if(application.status!=='APPROVED') throw invalidState();

        // 1) 대상 APPROVED → REVOKED, REVOKE 이력(사유 포함)
        const revoked=repo.setStatus(application.id,'REVOKED');
        const revokeHistoryId=repo.addHistory({
          applicationId:application.id, actorId:actor.id, action:'REVOKE',
          fromStatus:'APPROVED', toStatus:'REVOKED', reason
        });

        // 2) 같은 행사 PENDING 중 created_at ASC, id ASC 첫 1명(R5). 요청당 최대 1명.
        const next=repo.nextPending(event.id);
        if(!next) return { revoked, promoted:null };

        // 3) PENDING → APPROVED, AUTO_APPROVE 이력. 행위자는 승인 취소한 운영자, 원인은 REVOKE 이력.
        const promoted=repo.setStatus(next.id,'APPROVED');
        repo.addHistory({
          applicationId:next.id, actorId:actor.id, action:'AUTO_APPROVE',
          fromStatus:'PENDING', toStatus:'APPROVED', causeHistoryId:revokeHistoryId
        });
        return { revoked, promoted };
      });
    }
  };
}
