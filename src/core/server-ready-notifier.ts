import { Client } from "discord.js";

const READY_MESSAGE =
  "Hermes 출근했습니다. 질문 받을 준비도 끝났습니다.";

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
