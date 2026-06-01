const { filterOwnerNotificationUsers } = require("../src/core/scheduler/private-scheduler");

describe("private scheduler owner-only filtering", () => {
  test("keeps only the admin notification target", () => {
    const users = [
      { userId: "admin-id", region: "서울" },
      { userId: "other-id", region: "부산" },
    ];

    expect(filterOwnerNotificationUsers(users, "admin-id")).toEqual([
      { userId: "admin-id", region: "서울" },
    ]);
  });

  test("keeps no notification targets when admin id is missing", () => {
    expect(
      filterOwnerNotificationUsers([{ userId: "admin-id", region: "서울" }]),
    ).toEqual([]);
  });
});
