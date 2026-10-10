"use client";
import { useEffect, useState, type FormEvent } from "react";
import { aiStages, type ModelMap } from "../../domain/contracts";
import { stageEffort, type ModelInfo } from "@/domain/model-policy";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/molecules/form-field";
import { SelectField } from "@/components/molecules/select-field";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { api } from "@/lib/api";
import { StageModelRow } from "@/components/organisms/settings/stage-model-row";
export function SettingsPage() {
  const [catalog, setCatalog] = useState<ModelInfo[]>([]),
    [models, setModels] = useState<Partial<ModelMap>>({}),
    [executionMode, setExecutionMode] = useState<"manual" | "auto">("manual"),
    [message, setMessage] = useState(""),
    [tone, setTone] = useState<"error" | "success">("success"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      api<{ models: ModelInfo[] }>("models"),
      api<{ models?: ModelMap; executionMode?: "manual" | "auto" }>("settings"),
    ])
      .then(([c, s]) => {
        setCatalog(c.models);
        setModels(s.models ?? {});
        setExecutionMode(s.executionMode ?? "manual");
      })
      .catch((e) => {
        setTone("error");
        setMessage(String(e));
      });
  }, []);
  const select = (stage: (typeof aiStages)[number], model: string) =>
    setModels((old) => ({
      ...old,
      [stage]: { model, effort: stageEffort(stage) },
    }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("settings", "PUT", {
        models,
        executionMode,
      });
      setTone("success");
      setMessage("Đã lưu cấu hình. Task mới sẽ dùng lựa chọn này.");
    } catch (e) {
      setTone("error");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-primary">
          STAGE ROUTING
        </p>
        <h1>Model & skills</h1>
      </div>
      {message && <FeedbackMessage tone={tone}>{message}</FeedbackMessage>}
      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <h2>Chế độ thực thi</h2>
          </CardHeader>
          <CardContent>
            <FormField id="default-execution-mode" label="Chế độ mặc định">
              <SelectField
                id="default-execution-mode"
                label="Chế độ mặc định"
                value={executionMode}
                disabled={busy}
                onValueChange={(value) =>
                  setExecutionMode(value as "manual" | "auto")
                }
                options={[
                  { value: "manual", label: "Duyệt quyền khi cần" },
                  { value: "auto", label: "Auto sau khi duyệt Plan" },
                ]}
              />
            </FormField>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2>Model theo stage</h2>
          </CardHeader>
          <CardContent>
            {aiStages.map((stage) => (
              <StageModelRow
                key={stage}
                stage={stage}
                model={models[stage]?.model ?? ""}
                catalog={catalog}
                onSelect={select}
                disabled={busy}
              />
            ))}
          </CardContent>
        </Card>
        <Button type="submit" disabled={busy}>
          Lưu cấu hình
        </Button>
      </form>
    </>
  );
}
