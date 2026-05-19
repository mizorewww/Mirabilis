import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("greets through the Tauri command boundary", async () => {
    invokeMock.mockResolvedValue("Hello, Ada! You've been greeted from Rust!");

    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(/enter a name/i), "Ada");
    await userEvent.click(screen.getByRole("button", { name: /greet/i }));

    expect(invokeMock).toHaveBeenCalledWith("greet", { name: "Ada" });
    expect(
      await screen.findByText("Hello, Ada! You've been greeted from Rust!"),
    ).toBeInTheDocument();
  });
});
