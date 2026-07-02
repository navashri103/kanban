import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

const getFirstColumn = async () => (await screen.findAllByTestId(/column-/i))[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/board" && (!init || init.method === undefined)) {
          return Promise.resolve({
            ok: true,
            json: async () => structuredClone(initialData),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = await getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = await getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("renders icon-only delete buttons with accessible names", async () => {
    render(<KanbanBoard />);
    const column = await getFirstColumn();
    const deleteButtons = within(column).getAllByRole("button", {
      name: /^delete /i,
    });
    expect(deleteButtons.length).toBeGreaterThan(0);
    for (const button of deleteButtons) {
      expect(button).not.toHaveTextContent(/remove/i);
      expect(button.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("shows a card count in each column header", async () => {
    render(<KanbanBoard />);
    const columns = await screen.findAllByTestId(/column-/i);
    initialData.columns.forEach((column, index) => {
      expect(
        within(columns[index]).getByText(String(column.cardIds.length))
      ).toBeInTheDocument();
    });
  });

  it("adds a column up to the max, then disables adding further", async () => {
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    const addColumnButton = screen.getByRole("button", { name: /add a column/i });
    // initialData has 5 columns; max is 8, so 3 more clicks should reach the cap.
    await userEvent.click(addColumnButton);
    await userEvent.click(addColumnButton);
    await userEvent.click(addColumnButton);

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(8);
    expect(addColumnButton).toBeDisabled();
  });

  it("does not remove the last column while it still has cards", async () => {
    render(<KanbanBoard />);
    await screen.findAllByTestId(/column-/i);

    const removeColumnButton = screen.getByRole("button", { name: /remove a column/i });
    expect(removeColumnButton).toBeDisabled();
  });

  it("removes the last column once it is empty", async () => {
    render(<KanbanBoard />);
    const columns = await screen.findAllByTestId(/column-/i);
    const lastColumn = columns[columns.length - 1];

    const deleteButtons = within(lastColumn).queryAllByRole("button", {
      name: /^delete /i,
    });
    for (const button of deleteButtons) {
      await userEvent.click(button);
    }

    const removeColumnButton = screen.getByRole("button", { name: /remove a column/i });
    expect(removeColumnButton).not.toBeDisabled();
    await userEvent.click(removeColumnButton);

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(4);
  });
});
