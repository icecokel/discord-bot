# Legacy Hermes Provider Notes

## 상태

이 문서는 과거 Hermes 에이전트 운영 목표를 현재 구현 기준으로 정리한 legacy 참고 문서다. 현재 운영 기준은 `documents/codex-app-server-provider.md`이며, icenux 운영 기본값은 `AI_PROVIDER=codex`다.

## 현재 결론

- Hermes gateway는 사용하지 않는다.
- `HermesProvider` 구현은 legacy provider로 남아 있지만 현재 기본 경로가 아니다.
- `!헤르메스` prefix 명령은 Hermes를 켜지 않고 Codex 제어 호환 alias로 동작한다.
- `!헤르메스 켜기`는 `AI_PROVIDER`를 런타임에서 `codex`로 바꾼다.
- `!헤르메스 끄기`는 primary provider를 `gemini`로 바꾼다.
- `!헤르메스 초기화`는 관리자 대화 기억, Codex thread 매핑, legacy Hermes session 매핑을 함께 지운다.

## 남겨 둔 이유

Hermes 관련 코드는 즉시 제거하지 않고 다음 목적의 호환 계층으로 남긴다.

- 기존 운영 습관상 `!헤르메스` 명령을 입력해도 Codex 제어가 동작하게 한다.
- `AI_PROVIDER=hermes`로 수동 전환할 수 있는 legacy provider 코드를 보존한다.
- 과거 Hermes session 매핑이 남아 있어도 Codex 초기화와 함께 정리되도록 한다.

## 현재 관리자 AI 구조

현재 관리자 DM 자연어 경로는 Codex app-server를 사용한다.

```text
Discord 관리자 DM
  -> natural-language-router
  -> aiService
  -> CodexProvider
  -> codex app-server
```

관리자 DM 채널별 Codex thread 매핑은 메모리 기반이다. 봇은 관리자 최근 대화 10턴도 별도로 prompt에 포함한다.

## 안전 경계

과거 Hermes 운영에서 정한 안전 경계는 현재 Codex 운영에도 그대로 적용한다.

- Discord 메시지 전송, 삭제, 채널 관리 도구는 AI provider에 제공하지 않는다.
- 삭제, 초기화, 덮어쓰기, 강제 재설정, 권한 변경, 대량 발송, 서비스 중단은 바로 실행하지 않는다.
- 위험 작업은 대상, 영향 범위, 되돌리는 방법을 요약한 뒤 사용자 확인을 받아야 한다.
- 토큰, 비밀번호, 개인키 같은 민감정보 값은 출력하지 않는다.

## 제거 검토 조건

아래 조건을 만족하면 legacy Hermes provider와 `!헤르메스` alias 제거를 검토할 수 있다.

- 운영자가 `!코덱스` 명령만 사용한다.
- `AI_PROVIDER=hermes` 수동 복구 경로가 더 이상 필요 없다.
- 문서와 테스트에서 Hermes 호환 alias 의존성이 제거된다.
