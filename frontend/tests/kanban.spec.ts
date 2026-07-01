import { expect, test } from "@playwright/test";

// There is no signup screen in the UI yet (that's a later step), so tests
// create the account via the API. page.request shares the browser context's
// cookie jar with page, so the resulting session cookie is already set by
// the time we navigate - no need to fill in the login form separately.
const login = async (
  page: import("@playwright/test").Page,
  username?: string,
  password = "e2e-password"
) => {
  const user =
    username ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.request.post("/api/signup", { data: { username: user, password } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("requires login before showing the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).not.toBeVisible();
});

test("rejects an unknown account", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(`nobody-${Date.now()}`);
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("logs out after being signed in", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("logging in via the real form works for a signed-up account", async ({
  page,
}) => {
  const username = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = "e2e-password";
  // Sign up via the API (no signup screen yet), but log out so the session
  // cookie from that call is cleared, then log back in through the real form.
  await page.request.post("/api/signup", { data: { username, password } });
  await page.request.post("/api/logout");

  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("logging in via the form with the wrong password is rejected", async ({
  page,
}) => {
  const username = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.request.post("/api/signup", {
    data: { username, password: "correct-password" },
  });
  await page.request.post("/api/logout");

  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("loads the kanban board after login", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("signing up via the real form creates an account and shows the board", async ({
  page,
}) => {
  const username = `e2e-signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/");
  await page.getByRole("button", { name: /need an account/i }).click();
  await expect(page.getByRole("heading", { name: /create an account/i })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("a card added before logout is still there after logging back in (real persistence)", async ({
  page,
}) => {
  const username = `e2e-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = "e2e-password";

  await page.goto("/");
  await page.getByRole("button", { name: /need an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Survives logout");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Survives logout")).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(
    page.locator('[data-testid^="column-"]').first().getByText("Survives logout")
  ).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("AI chat sidebar can add a card to the board live", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /open ai chat/i }).click();
  await page.getByLabel("Chat message").fill(
    "Add a card called Sidebar AI Card to the Backlog column."
  );
  await page.getByRole("button", { name: /send/i }).click();

  // Real AI call (no mocking) - give it a generous timeout since free
  // OpenRouter models can be slow or momentarily rate-limited.
  await expect(page.getByText("Sidebar AI Card")).toBeVisible({ timeout: 30_000 });
});

test("can add and remove columns within the min/max bounds", async ({ page }) => {
  await login(page);

  const addButton = page.getByRole("button", { name: /add a column/i });
  const removeButton = page.getByRole("button", { name: /remove a column/i });
  const columns = page.locator('[data-testid^="column-"]');

  await expect(columns).toHaveCount(5);
  // The last seeded column ("Done") starts with cards, so removal is blocked.
  await expect(removeButton).toBeDisabled();

  await addButton.click();
  await expect(columns).toHaveCount(6);
  // The newly added column is the new last column and starts empty, so
  // removal should now be allowed.
  await expect(removeButton).not.toBeDisabled();

  await removeButton.click();
  await expect(columns).toHaveCount(5);
});
