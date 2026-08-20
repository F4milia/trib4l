import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the Trib4l heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Trib4l" })).toBeInTheDocument();
  });
});
