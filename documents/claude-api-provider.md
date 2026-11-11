# Claude API provider

관리자 DM, `/질문`, 긱뉴스 요약·번역, X 감시 번역은 기본적으로 Claude를 사용한다. 로컬 `resume-bullet-editor`의 서버 연동과 같이 공식 `@anthropic-ai/sdk`의 Messages API를 호출한다.

## 설정

```dotenv
AI_PROVIDER=claude
CLAUDE_MODEL=claude-sonnet-5-5
CLAUDE_TIMEOUT_MS=45000
```

`ANTHROPIC_API_KEY`도 봇 프로세스 환경에 설정한다. 키는 Git, 로그, Discord 응답에 포함하지 않는다. SDK는 `https://api.anthropic.com`에 연결하고 자동 재시도는 하지 않는다. 환경변수가 없는 모델·제한 시간은 위 기본값을 사용한다. 운영 `.env` 위치는 [운영 서버 가이드](mac-mini-deployment.md#운영-설정)를 따른다.

## 요청과 응답

- `systemInstruction`은 API의 `system`으로 전달하며 사용자 원문과 분리한다.
- `config.maxOutputTokens`는 `max_tokens`로 전달한다. 지정하지 않으면 4096이다.
- 긱뉴스와 X 번역은 `output_config.format`의 JSON 스키마를 지정하며, 기존 한국어·내용 검증도 유지한다.
- `stop_reason=end_turn`인 완성된 텍스트만 반환한다. 잘림, 거절, 빈 응답은 실패 처리한다.
- 인증, 요청 한도, 제한 시간 오류는 안전한 안내로 바꾼다. SDK 오류 원문과 요청 데이터는 출력하지 않는다.

## 관리자 대화와 첨부

`!클로드 상태`, `!클로드 켜기`, `!클로드 초기화`를 사용한다. `!코덱스`와 `!헤르메스`는 동일한 Claude 제어 명령의 호환 alias다. 관리자 DM은 최근 대화 10턴을 prompt에 포함하며 초기화·프로세스 재시작 시 기억이 사라진다. `/질문`은 대화 기억 없이 한 번만 호출한다.

관리자 DM의 PNG, JPEG, GIF, WebP 이미지는 HTTPS URL 이미지 블록으로 전달한다. 최대 4개, 각 7,000,000 bytes 이내이며 API의 인코딩 크기 여유를 확보한다. 로컬 파일로 다운로드하지 않는다. 지원하지 않는 형식·초과 첨부는 전달 제외 상태를 prompt에 명시한다. 이미지 URL이 만료되거나 API가 읽지 못하면 요청이 실패한다. 해상도는 API의 8000×8000 제한을 따르며 봇이 별도로 검사하거나 변환하지 않는다.

Claude API 경로에는 웹 검색, 브라우저, 터미널, 서버·로컬 파일 접근 도구가 없다. 실제 실행을 했다고 응답하지 않도록 시스템 지시를 구분한다. 관리자 대화·첨부와 번역할 원문은 외부 Claude API로 전달되며, 최종 Discord 발송은 봇이 담당한다.

## Legacy 호환

`AI_PROVIDER`가 비어 있거나 지원하지 않는 값이면 Claude를 선택한다. Codex와 Hermes provider는 기존 구현을 유지하며 `AI_PROVIDER=codex` 또는 `AI_PROVIDER=hermes`로 명시 선택할 수 있다. 긱뉴스·X 작업은 이 설정과 관계없이 Claude를 호출한다. Claude 실패 시 다른 공급자로 자동 전환하지 않는다.

## 공식 참고

- [TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
