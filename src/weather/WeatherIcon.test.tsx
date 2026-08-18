import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WEATHER_CONDITIONS } from "../../shared/weatherProtocol";
import { WeatherIcon } from "./WeatherIcon";

describe("WeatherIcon", () => {
  it.each(WEATHER_CONDITIONS)("renders %s as a decorative local SVG", (condition) => {
    const { container } = render(<WeatherIcon condition={condition} />);
    const icon = container.querySelector("svg");

    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('use[href^="http"]')).toBeNull();
  });
});
