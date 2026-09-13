const mockLaunch = jest.fn();
jest.mock("playwright", () => ({ chromium: { launch: (...args) => mockLaunch(...args) } }));
const { fetchXProfile, readXArticles } = require("../src/features/x-monitor/x-profile-source");
let page, close, rows, loading;
const row = (id, pinned = false) => ({ id, text: `post ${id}`, textComplete: true, pinned });
beforeEach(() => {
  jest.clearAllMocks();
  rows = [row("101"), row("100"), row("99")];
  loading = 0;
  page = {
    goto: jest.fn().mockResolvedValue({ status: () => 200 }),
    setDefaultTimeout: jest.fn(),
    locator: jest.fn((selector) => ({ first: () => ({ waitFor: async () => {} }), count: async () => selector.includes("progressbar") ? loading : 0 })),
    evaluate: jest.fn(async (fn) => fn === readXArticles ? rows : undefined),
    waitForTimeout: jest.fn(),
    url: () => "https://x.com/thsottiaux",
  };
  close = jest.fn().mockResolvedValue(undefined);
  mockLaunch.mockResolvedValue({ newContext: async () => ({ newPage: async () => page }), close });
});
test("collects through checkpoint and always closes Chromium", async () => {
  const result = await fetchXProfile("100");
  expect(result.complete).toBe(true);
  expect(result.posts.map(p => p.id)).toEqual(["101", "100", "99"]);
  expect(close).toHaveBeenCalledTimes(1);
});
test("403 cannot become a successful empty crawl", async () => {
  page.goto.mockResolvedValue({ status: () => 403 });
  await expect(fetchXProfile()).rejects.toThrow("blocked");
  expect(close).toHaveBeenCalledTimes(1);
});
test("a redirect cannot be mistaken for the target profile", async () => {
  page.url = () => "https://x.com/home";
  await expect(fetchXProfile()).rejects.toThrow("다른 페이지");
  expect(close).toHaveBeenCalledTimes(1);
});
test("empty or changed DOM fails closed and closes the browser", async () => {
  rows = [];
  await expect(fetchXProfile()).rejects.toThrow("0건");
  page.evaluate.mockRejectedValue(new Error("selector changed"));
  await expect(fetchXProfile()).rejects.toThrow("DOM");
  expect(close).toHaveBeenCalledTimes(2);
});
test("a stalled loader is incomplete and cannot initialize a baseline", async () => {
  loading = 1;
  expect((await fetchXProfile()).complete).toBe(false);
  expect(close).toHaveBeenCalledTimes(1);
});
test("missing checkpoint is reported as a coverage gap", async () => {
  expect((await fetchXProfile("98")).complete).toBe(false);
});
test("a pinned old post alone cannot short-circuit the crawl", async () => {
  rows = [row("90", true), row("101"), row("102")];
  expect((await fetchXProfile("100")).complete).toBe(false);
  expect(page.waitForTimeout).toHaveBeenCalled();
});
test("successful detail reads preserve expanded text", async () => {
  rows[0].textComplete = false;
  page.goto.mockImplementation(async (url) => {
    if (url.endsWith("/status/101")) rows = [{ ...row("101"), text: "expanded full post" }];
    return { status: () => 200 };
  });
  const result = await fetchXProfile("100");
  expect(result.posts[0]).toMatchObject({ text: "expanded full post", textComplete: true });
});
