"use client";
import { useEffect, useState, type FormEvent } from "react";
import { aiStages, type ModelMap, type ModelChoice } from "../core/contracts";
import type { ModelInfo } from "../core/model-policy";
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
  const select = (
    stage: (typeof aiStages)[number],
    patch: Partial<ModelChoice>,
  ) =>
    setModels((old) => ({
      ...old,
      [stage]: { model: "", effort: "", ...old[stage], ...patch },
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
        Dùng model mạnh để lập plan; model trung bình để implement theo plan đã
        duyệt.
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
                      : stage === "implement"
                        ? "Model trung bình · thực thi"
                        : "Chọn theo nhu cầu"}
                  </p>
                </div>
                <label className="sr-label">
                  Model {stage}
                  <select
                    required
                    value={models[stage]?.model ?? ""}
                    onChange={(e) =>
                      select(stage, { model: e.target.value, effort: "" })
                    }
                  >
                    <option value="">Chọn model</option>
                    {catalog.map((m) => (
                      <option key={m.id}>{m.id}</option>
                    ))}
                  </select>
                </label>
                <label className="sr-label">
                  Effort {stage}
                  <select
                    required
                    value={models[stage]?.effort ?? ""}
                    onChange={(e) => select(stage, { effort: e.target.value })}
                  >
                    <option value="">Effort</option>
                    {catalog
                      .find((m) => m.id === models[stage]?.model)
                      ?.efforts.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
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
