import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CityLocationV1 } from "../../shared/profileProtocol";
import { ProfilePanel, type ProfilePanelProps } from "./ProfilePanel";

const hangzhou: CityLocationV1 = {
  provider: "weatherapi",
  providerLocationId: 1,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.2741,
  longitude: 120.1551,
};

const suzhou: CityLocationV1 = {
  provider: "weatherapi",
  providerLocationId: 2,
  name: "苏州",
  region: "江苏",
  country: "中国",
  latitude: 31.2989,
  longitude: 120.5853,
};

function renderProfilePanel(props: Partial<ProfilePanelProps> = {}) {
  const mergedProps: ProfilePanelProps = {
    profile: null,
    searchState: "idle",
    searchResults: [],
    saveState: "idle",
    onSearch: vi.fn().mockResolvedValue(undefined),
    onSave: vi.fn().mockResolvedValue({ ok: true }),
    ...props,
  };

  const view = render(<ProfilePanel {...mergedProps} />);
  return { ...view, props: mergedProps };
}

describe("ProfilePanel", () => {
  it("searches only on explicit search or Enter", () => {
    const onSearch = vi.fn().mockResolvedValue(undefined);
    renderProfilePanel({ onSearch });

    fireEvent.change(screen.getByLabelText("所在城市"), {
      target: { value: "杭州" },
    });
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "搜索城市" }));
    expect(onSearch).toHaveBeenCalledWith("杭州");

    fireEvent.change(screen.getByLabelText("所在城市"), {
      target: { value: "苏州" },
    });
    fireEvent.keyDown(screen.getByLabelText("所在城市"), { key: "Enter" });
    expect(onSearch).toHaveBeenLastCalledWith("苏州");
  });

  it("keeps an unsaved draft when the persisted profile is reconstructed unchanged", () => {
    const initialProfile = {
      version: 1 as const,
      nickname: "小满",
      city: hangzhou,
    };
    const view = renderProfilePanel({ profile: initialProfile });

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "未保存昵称" },
    });
    fireEvent.change(screen.getByLabelText("所在城市"), {
      target: { value: "未保存城市" },
    });

    view.rerender(
      <ProfilePanel
        {...view.props}
        profile={{
          ...initialProfile,
          city: { ...initialProfile.city },
        }}
      />,
    );

    expect((screen.getByLabelText("昵称") as HTMLInputElement).value).toBe(
      "未保存昵称",
    );
    expect((screen.getByLabelText("所在城市") as HTMLInputElement).value).toBe(
      "未保存城市",
    );
  });

  it("accepts 20 emoji code points and trims a 21st consistently", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    renderProfilePanel({ searchResults: [hangzhou], onSave });
    const nickname = screen.getByLabelText("昵称") as HTMLInputElement;
    const twentyEmoji = "😀".repeat(20);

    expect(nickname.getAttribute("maxlength")).toBeNull();
    fireEvent.change(nickname, { target: { value: twentyEmoji } });
    expect(nickname.value).toBe(twentyEmoji);

    fireEvent.change(nickname, { target: { value: `${twentyEmoji}😀` } });
    expect(nickname.value).toBe(twentyEmoji);
    fireEvent.click(screen.getByRole("button", { name: /杭州 浙江 中国/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        version: 1,
        nickname: twentyEmoji,
        city: hangzhou,
      }),
    );
  });

  it("requires a nickname and selected result before save", () => {
    const { props } = renderProfilePanel();
    const saveButton = screen.getByRole("button", { name: "保存资料" });

    expect(saveButton.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "小满" },
    });
    fireEvent.click(saveButton);

    expect(screen.getByText("请先从搜索结果中选择城市")).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("renders loading, empty, error, and at most five search results", () => {
    const locations = Array.from({ length: 7 }, (_, index) => ({
      ...hangzhou,
      providerLocationId: index + 1,
      name: `城市${index}`,
    }));
    const { rerender } = renderProfilePanel({ searchState: "searching" });

    expect(screen.getByText("正在搜索城市...")).toBeTruthy();

    rerender(
      <ProfilePanel
        profile={null}
        searchState="idle"
        searchResults={[]}
        saveState="idle"
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    fireEvent.change(screen.getByLabelText("所在城市"), {
      target: { value: "没有结果" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索城市" }));
    expect(screen.getByText("没有找到匹配的城市")).toBeTruthy();

    rerender(
      <ProfilePanel
        profile={null}
        searchState="error"
        searchResults={[]}
        saveState="idle"
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText("城市搜索失败，请稍后重试")).toBeTruthy();

    rerender(
      <ProfilePanel
        profile={null}
        searchState="idle"
        searchResults={locations}
        saveState="idle"
        onSearch={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getAllByRole("button", { name: /城市\d/ })).toHaveLength(5);
  });

  it("keeps a boundary-length city name inside an ellipsis container", () => {
    const longName = "城".repeat(80);
    renderProfilePanel({
      searchResults: [{ ...hangzhou, name: longName }],
    });

    const cityName = screen.getByText(longName);
    const copy = cityName.parentElement;
    const result = cityName.closest("button");
    expect(cityName.className).toBe("profile-city-name");
    expect(copy?.className).toBe("profile-city-result-copy");
    expect(result?.classList.contains("profile-city-result")).toBe(true);
    expect(copy?.parentElement).toBe(result);
  });

  it("keeps prior results hidden after a blank search submission", () => {
    const onSearch = vi.fn().mockResolvedValue(undefined);
    renderProfilePanel({ searchResults: [hangzhou], onSearch });
    expect(screen.getByLabelText("城市搜索结果")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("所在城市"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索城市" }));

    expect(screen.queryByLabelText("城市搜索结果")).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("selects a city and saves the normalized basic profile", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    renderProfilePanel({ searchResults: [hangzhou, suzhou], onSave });

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "  小满  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /杭州 浙江 中国/ }));
    const selected = screen.getByRole("button", { name: /杭州 浙江 中国/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        version: 1,
        nickname: "小满",
        city: hangzhou,
      }),
    );
  });

  it("shows pending sync state without changing control dimensions", () => {
    renderProfilePanel({
      profile: { version: 1, nickname: "小满", city: hangzhou },
      saveState: "pending",
    });

    expect(screen.getByText("等待同步")).toBeTruthy();
    expect(screen.getByText("最多 20 个字")).toBeTruthy();
    expect(
      screen.getByText("仅同步城市，不读取或上传精确定位"),
    ).toBeTruthy();
  });
});
