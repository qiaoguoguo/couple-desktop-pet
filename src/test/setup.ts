import { vi } from "vitest";

vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
