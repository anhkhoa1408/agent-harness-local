"use client";
import { useEffect, useState, type FormEvent } from "react";
import { aiStages, type ModelMap } from "../core/contracts";
import { stageEffort, type ModelInfo } from "../core/model-policy";
import { api } from "./api";
import { StageModelRow } from "./settings/stage-model-row";
export function ModelSettings() {
  const [catalog, setCatalog] = useState<ModelInfo[]>([]),
    [models, setModels] = useState<Partial<ModelMap>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("models"), api("settings")])
      .then(([c, s]) => {
        setCatalog(c.models);
        setModels(s.models ?? {});
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
              <StageModelRow
                key={stage}
                stage={stage}
                model={models[stage]?.model ?? ""}
                catalog={catalog}
                onSelect={select}
              />
            ))}
          </div>
        </section>
        <section className="panel">
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
        <button className="primary" disabled={busy}>
          Lưu cấu hình
        </button>
      </form>
    </>
  );
}
