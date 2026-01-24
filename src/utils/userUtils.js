/**
 * 사용자 정보 관련 유틸리티 함수 모음
 */

/**
 * 메시지 객체에서 사용자의 표시 이름(Display Name)을 가져옵니다.
 * 서버(Guild) 내의 별명(Nickname)을 최우선으로 하며, 없을 경우 글로벌 표시 이름(Global Name),
 * 그마저도 없으면 사용자명(Username)을 반환합니다.
 *
 * @param {import('discord.js').Message} message - 디스코드 메시지 객체
 * @returns {string} 사용자의 표시 이름
 */
const getDisplayName = (message) => {
  if (!message || !message.author) {
    return "알 수 없는 사용자";
  }

  // 1. 서버 멤버 정보가 있으면 닉네임(displayName) 우선
  if (message.member && message.member.displayName) {
    return message.member.displayName;
  }

  // 2. 글로벌 표시 이름 (Global Name)
  if (message.author.globalName) {
    return message.author.globalName;
  }

  // 3. 기본 사용자명 (Username)
  return message.author.username;
};

module.exports = {
  getDisplayName,
};
