import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function TestingStackProbe() {
  const [interactionCount, setInteractionCount] = useState(0);

  return (
    <section aria-label="Frontend testing stack">
      <p role="status" aria-label="Interaction count">
        Interactions recorded: {interactionCount}
      </p>
      <button
        type="button"
        onClick={() => setInteractionCount((currentCount) => currentCount + 1)}
      >
        Record interaction
      </button>
    </section>
  );
}

describe("frontend testing stack", () => {
  it("renders React components and observes user-visible updates after real clicks", async () => {
    const user = userEvent.setup();

    render(<TestingStackProbe />);

    expect(
      screen.getByRole("region", { name: "Frontend testing stack" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Interaction count" })).toHaveTextContent(
      "Interactions recorded: 0",
    );

    await user.click(screen.getByRole("button", { name: "Record interaction" }));

    expect(screen.getByRole("status", { name: "Interaction count" })).toHaveTextContent(
      "Interactions recorded: 1",
    );
  });
});
