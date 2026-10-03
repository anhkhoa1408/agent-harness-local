"use client";
import { useEffect, useState, type FormEvent } from "react";
import { aiStages, type ModelMap } from "../core/contracts";
import { stageEffort, type ModelInfo } from "../core/model-policy";
import { api, stageLabel } from "./api";
export function ModelSettings() {
  const [catalog, setCatalog] = useState<ModelInfo[]>([]),
    [models, setModels] = useState<Partial<ModelMap>>({}),
    [roots, setRoots] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("models"), api("settings")])
      .then(([c, s]) => {
        setCatalog(c.models);
        setModels(s.models ?? {});
        setRoots(s.skillRoots ?? {});
      })
      .catch((e) => setMessage(String(e)));
  }, []);
  const select = (stage: (typeof aiStages)[number], model: string) =>
    setModels((old) => ({
      ...old,
      [stage]: { model, effort: stageEffort(stage) },
    }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("settings", "PUT", {
        models,
        skillRoots: Object.fromEntries(
          Object.entries(roots).filter(([, v]) => v.trim()),
        ),
      });
      setMessage("Đã lưu cấu hình. Task mới sẽ dùng lựa chọn này.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">STAGE ROUTING</p>
      <h1>Đúng model, đúng công việc.</h1>
      <p className="muted">
        Plan dùng model mạnh với effort high. Các stage AI còn lại dùng model
        tiết kiệm với effort medium.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <form onSubmit={save}>
        <section className="panel">
          <h2>Model theo stage</h2>
          <p className="hint">
            Catalog từ Codex local. Không tự fallback khi model hoặc effort
            không khả dụng.
          </p>
          <div className="model-grid">
            {aiStages.map((stage) => (
              <div className="model-row" key={stage}>
                <div>
                  <strong>{stageLabel[stage]}</strong>
                  <p>
                    {stage === "plan"
                      ? "Model mạnh · plan và replan"
                      : "Model tiết kiệm · medium"}
                  </p>
                </div>
                <label className="sr-label">
                  Model {stage}
                  <select
                    required
                    value={models[stage]?.model ?? ""}
                    onChange={(e) => select(stage, e.target.value)}
                  >
                    <option value="">Chọn model</option>
                    {catalog.map((m) => (
                      <option key={m.id}>{m.id}</option>
                    ))}
                  </select>
                </label>
                <span className="badge">Effort {stageEffort(stage)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Agent theo stage</h2>
          <p className="hint">
            Agent profile được đóng gói sẵn; mỗi task lưu snapshot riêng.
          </p>
          <ul>
            <li>Discover: Repo explorer của harness</li>
            <li>Analyze: VoltAgent business-analyst</li>
            <li>Plan: ECC planner</li>
            <li>
              Implement: specialist theo repo + ECC tdd-guide; e2e-runner khi
              plan yêu cầu E2E
            </li>
            <li>Review: ECC code-reviewer · chỉ đọc</li>
            <li>
              Repair: VoltAgent debugger + ECC build-error-resolver + tdd-guide
            </li>
            <li>Prepare, verify, deliver: worker và test runner</li>
          </ul>
        </section>
        <section className="panel">
          <h2>Skill roots</h2>
          <p className="hint">
            Đường dẫn tới thư mục chứa các skill. Context được snapshot theo
            task; chỉnh file gốc không thay đổi task đang chạy.
          </p>
          {["superpowers", "mattpocock-skills", "baseline"].map((key) => (
            <label key={key}>
              {key}
              {key === "baseline" ? " (AGENTS.md, tùy chọn)" : ""}
              <input
                value={roots[key] ?? ""}
                onChange={(e) => setRoots({ ...roots, [key]: e.target.value })}
                placeholder={
                  key === "baseline"
                    ? "Mặc định: AGENTS.md của harness"
                    : "/path/to/plugin/skills"
                }
                required={key !== "baseline"}
              />
            </label>
          ))}
        </section>
        <button className="primary" disabled={busy}>
          Lưu cấu hình
        </button>
      </form>
    </>
  );
}
