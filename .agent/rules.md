# Project Rules

## General

1. **Rule Compliance**: Must strictly follow Global/Workspace Workflows, Skills, and Rules.

## Critical Rules (.env Modification Forbidden)

1. **.env 파일 절대 수정 불가**: `.env` 파일은 어떤 경우에도 AI가 직접 수정하지 않는다. 변경이 필요한 경우 **반드시 사용자에게 요청**해야 한다.

## Command Implementation

1. **Case Insensitivity**: All English commands must handle input case-insensitively (e.g., `!Ping` = `!ping`).
2. **Korean Aliases**: Every command must have at least one Korean alias (e.g., `!ping` -> `['!ping', '핑']`).
