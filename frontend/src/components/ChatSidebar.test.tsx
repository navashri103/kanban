import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { initialData } from "@/lib/kanban";

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openSidebar = async () => {
    await userEvent.click(screen.getByRole("button", { name: /open ai chat/i }));
  };

  it("is collapsed by default and opens on click", async () => {
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    expect(screen.queryByLabelText("Chat message")).not.toBeInTheDocument();

    await openSidebar();
    expect(screen.getByLabelText("Chat message")).toBeInTheDocument();
  });

  it("sends a message and renders the AI's reply", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Sure, done!", board_update: null }),
    });
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await openSidebar();

    await userEvent.type(screen.getByLabelText("Chat message"), "Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Sure, done!")).toBeInTheDocument();
    expect(screen.getByText("Add a card")).toBeInTheDocument();
  });

  it("calls onBoardUpdate when the AI returns an updated board", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "Added the card.",
        board_update: structuredClone(initialData),
      }),
    });
    const onBoardUpdate = vi.fn();
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);
    await openSidebar();

    await userEvent.type(screen.getByLabelText("Chat message"), "Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Added the card.");
    expect(onBoardUpdate).toHaveBeenCalledWith(initialData);
  });

  it("shows an error when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ChatSidebar onBoardUpdate={vi.fn()} />);
    await openSidebar();

    await userEvent.type(screen.getByLabelText("Chat message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});
