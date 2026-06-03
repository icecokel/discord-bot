import { Client } from "discord.js";

const READY_MESSAGE =
  "✅ icenux 서버 준비 완료. discord-bot 로그인 및 스케줄러 초기화 완료. Hermes 대화 맥락 응답 준비 완료.";

export const notifyServerReady = async (
  client: Pick<Client, "user" | "users">,
  adminId: string | undefined = process.env.ADMIN_ID,
): Promise<void> => {
  if (!adminId) return;

  try {
    const adminUser = await client.users.fetch(adminId);
    await adminUser.send(READY_MESSAGE);
    console.log(
      `[ServerReadyNotifier] 준비 알림 전송 완료 (${client.user?.tag || "unknown bot"})`,
    );
  } catch (error: any) {
    console.error(
      "[ServerReadyNotifier] 준비 알림 전송 실패:",
      error.message,
    );
  }
};
