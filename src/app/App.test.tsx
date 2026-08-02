import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the MVP shell", () => {
    render(<App />);

    expect(screen.getByText("情侣桌宠 MVP")).toBeTruthy();
  });
});
