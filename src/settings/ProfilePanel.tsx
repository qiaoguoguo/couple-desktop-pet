import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  NICKNAME_MAX_LENGTH,
  type CityLocationV1,
  type ProfileUpdateV1,
} from "../../shared/profileProtocol";
import type { ProfileSettings } from "./settingsTypes";

export interface ProfilePanelProps {
  profile: ProfileUpdateV1 | null;
  searchState: "idle" | "searching" | "error";
  searchResults: CityLocationV1[];
  saveState: ProfileSettings["syncState"];
  onSearch(query: string): Promise<void> | void;
  onSave(
    profile: ProfileUpdateV1,
  ): Promise<{ ok: boolean; message?: string }>;
}

export function ProfilePanel({
  profile,
  searchState,
  searchResults,
  saveState,
  onSearch,
  onSave,
}: ProfilePanelProps) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [cityQuery, setCityQuery] = useState(profile?.city.name ?? "");
  const [selectedCity, setSelectedCity] = useState<CityLocationV1 | null>(
    profile?.city ?? null,
  );
  const [hasSearched, setHasSearched] = useState(searchResults.length > 0);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const trimmedNickname = nickname.trim();
  const saving = saveState === "saving";
  const canSave = Boolean(trimmedNickname && selectedCity) && !saving;
  const persistedProfileSignature = profileSignature(profile);

  useEffect(() => {
    setNickname(profile?.nickname ?? "");
    setCityQuery(profile?.city.name ?? "");
    setSelectedCity(profile?.city ?? null);
    setSaveAttempted(false);
    setFormError(null);
  }, [persistedProfileSignature]);

  function requestSearch() {
    const query = cityQuery.trim();
    setFormError(null);
    if (!query) {
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    void onSearch(query);
  }

  function handleCityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    requestSearch();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveAttempted(true);
    setFormError(null);
    if (!trimmedNickname || !selectedCity || saving) {
      return;
    }

    const result = await onSave({
      version: 1,
      nickname: trimmedNickname,
      city: selectedCity,
    });
    if (!result.ok) {
      setFormError(result.message ?? "资料保存失败，请稍后重试");
    }
  }

  function handleCancel() {
    setNickname(profile?.nickname ?? "");
    setCityQuery(profile?.city.name ?? "");
    setSelectedCity(profile?.city ?? null);
    setHasSearched(false);
    setSaveAttempted(false);
    setFormError(null);
  }

  const nicknameError = saveAttempted && !trimmedNickname;
  const cityError = (saveAttempted || Boolean(trimmedNickname)) && !selectedCity;

  return (
    <section className="profile-panel" aria-label="基本信息">
      <header className="profile-panel-header">
        <h2>基本信息</h2>
        <p>设置你希望对方看到的昵称和城市</p>
      </header>

      <form className="profile-form" onSubmit={handleSave}>
        <label className="profile-field">
          <span>昵称</span>
          <input
            aria-label="昵称"
            type="text"
            value={nickname}
            onChange={(event) => {
              setNickname(limitNickname(event.currentTarget.value));
              setFormError(null);
            }}
          />
          <small>最多 20 个字</small>
        </label>
        {nicknameError ? <p className="profile-error">请输入昵称</p> : null}

        <label className="profile-field">
          <span>所在城市</span>
          <div className="profile-city-search">
            <input
              aria-label="所在城市"
              type="text"
              value={cityQuery}
              onChange={(event) => {
                setCityQuery(event.currentTarget.value);
                setSelectedCity(null);
                setHasSearched(false);
                setFormError(null);
              }}
              onKeyDown={handleCityKeyDown}
            />
            <button
              type="button"
              aria-label="搜索城市"
              disabled={searchState === "searching"}
              onClick={requestSearch}
            >
              <SearchIcon />
            </button>
          </div>
        </label>

        {searchState === "searching" ? (
          <p className="profile-search-status">正在搜索城市...</p>
        ) : null}
        {searchState === "error" ? (
          <p className="profile-error">城市搜索失败，请稍后重试</p>
        ) : null}
        {searchState === "idle" && hasSearched && searchResults.length === 0 ? (
          <p className="profile-search-status">没有找到匹配的城市</p>
        ) : null}

        {searchState === "idle" && hasSearched && searchResults.length > 0 ? (
          <div className="profile-city-results" aria-label="城市搜索结果">
            {searchResults.slice(0, 5).map((city) => {
              const selected = sameCity(city, selectedCity);
              const label = cityLabel(city);
              return (
                <button
                  key={`${city.provider}:${city.providerLocationId}`}
                  type="button"
                  className={`profile-city-result${
                    selected ? " is-selected" : ""
                  }`}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedCity(city);
                    setCityQuery(city.name);
                    setFormError(null);
                  }}
                >
                  <span className="profile-city-result-copy">
                    <strong className="profile-city-name">{city.name}</strong>
                    <small>
                      {[city.region, city.country].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {selected ? <CheckIcon /> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {cityError ? (
          <p className="profile-error">请先从搜索结果中选择城市</p>
        ) : null}

        <p className="profile-privacy">
          <ShieldCheckIcon />
          <span>仅同步城市，不读取或上传精确定位</span>
        </p>

        {formError ? <p className="profile-error">{formError}</p> : null}
        {saveState === "pending" ? (
          <p className="profile-sync-state">等待同步</p>
        ) : null}

        <div className="profile-actions">
          <button
            type="button"
            aria-label="取消资料编辑"
            onClick={handleCancel}
            disabled={saving}
          >
            取消
          </button>
          <button type="submit" className="profile-save" disabled={!canSave}>
            {saving ? "保存中" : "保存资料"}
          </button>
        </div>
      </form>
    </section>
  );
}

function cityLabel(city: CityLocationV1): string {
  return [city.name, city.region, city.country].filter(Boolean).join(" ");
}

function profileSignature(profile: ProfileUpdateV1 | null): string {
  if (profile === null) {
    return "";
  }

  return JSON.stringify([
    profile.version,
    profile.nickname,
    profile.city.provider,
    profile.city.providerLocationId,
    profile.city.name,
    profile.city.region,
    profile.city.country,
    profile.city.latitude,
    profile.city.longitude,
  ]);
}

function limitNickname(value: string): string {
  return Array.from(value).slice(0, NICKNAME_MAX_LENGTH).join("");
}

function sameCity(
  first: CityLocationV1,
  second: CityLocationV1 | null,
): boolean {
  return (
    second !== null &&
    first.provider === second.provider &&
    first.providerLocationId === second.providerLocationId
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
