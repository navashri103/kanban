import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { initialData } from "@/lib/kanban";

const mockFetch = (authenticated: boolean) =>
  vi.fn((url: string) => {
    if (url === "/api/session") {
      return Promise.resolve({ ok: true, json: async () => ({ authenticated }) });
    }
    if (url === "/api/board") {
      return Promise.resolve({ ok: true, json: async () => structuredClone(initialData) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

describe("AuthGate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when there is no active session", async () => {
    vi.stubGlobal("fetch", mockFetch(false));
    render(<AuthGate />);

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("shows the kanban board when there is an active session", async () => {
    vi.stubGlobal("fetch", mockFetch(true));
    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("returns to the login screen after logging out", async () => {
    vi.stubGlobal("fetch", mockFetch(true));

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /kanban studio/i });

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("toggles to the signup form and back", async () => {
    vi.stubGlobal("fetch", mockFetch(false));
    render(<AuthGate />);

    await screen.findByRole("heading", { name: /welcome back/i });
    await userEvent.click(screen.getByRole("button", { name: /need an account/i }));
    expect(
      await screen.findByRole("heading", { name: /create your account/i })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /already have an account/i })
    );
    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });
});
