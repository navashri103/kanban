import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls onSuccess when sign in succeeds", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    render(
      <LoginForm mode="signin" onSuccess={onSuccess} onToggleMode={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onSuccess).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error and does not call onSuccess when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const onSuccess = vi.fn();
    render(
      <LoginForm mode="signin" onSuccess={onSuccess} onToggleMode={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid/i);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls the signup endpoint and onSuccess when signing up", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    render(
      <LoginForm mode="signup" onSuccess={onSuccess} onToggleMode={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText("Username"), "newuser");
    await userEvent.type(screen.getByLabelText("Password"), "newpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(onSuccess).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/signup",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("calls onToggleMode when the switch link is clicked", async () => {
    const onToggleMode = vi.fn();
    render(
      <LoginForm mode="signin" onSuccess={vi.fn()} onToggleMode={onToggleMode} />
    );

    await userEvent.click(screen.getByRole("button", { name: /need an account/i }));
    expect(onToggleMode).toHaveBeenCalled();
  });
});
