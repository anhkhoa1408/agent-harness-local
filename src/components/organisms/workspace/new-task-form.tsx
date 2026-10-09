import type { FormEvent } from "react";
import type { Repository } from "@/core/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/molecules/form-field";
import { SelectField } from "@/components/molecules/select-field";
export function NewTaskForm({
  repos,
  repoId,
  onRepoChange,
  onSubmit,
  busy,
  configured,
}: {
  repos: Repository[];
  repoId: string;
  onRepoChange: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
  configured: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormField id="repository" label="Repository">
        <SelectField
          id="repository"
          name="repositoryId"
          label="Repository"
          value={repoId}
          onValueChange={onRepoChange}
          required
          disabled={busy}
          placeholder="Chọn repo"
          options={repos.map((r) => ({
            value: r.id,
            label: `${r.root.split("/").pop()} · ${r.baseBranch}`,
          }))}
        />
      </FormField>
      <FormField id="task-title" label="Tên task">
        <Input
          id="task-title"
          name="title"
          placeholder="Ví dụ: Thêm bộ lọc trạng thái"
          required
          maxLength={200}
        />
      </FormField>
      <FormField id="task-requirement" label="Yêu cầu">
        <Textarea
          id="task-requirement"
          name="requirement"
          rows={5}
          placeholder="Hành vi mong đợi, phạm vi và tiêu chí thành công…"
          required
          className="min-h-32"
        />
      </FormField>
      <FormField id="delivery-mode" label="Bàn giao">
        <SelectField
          id="delivery-mode"
          name="deliveryMode"
          label="Bàn giao"
          defaultValue="local"
          options={[
            { value: "local", label: "Local · branch và báo cáo" },
            { value: "github", label: "GitHub · pull request" },
          ]}
        />
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="splitIntoStories"
          className="mt-1"
          disabled={busy}
        />
        Chia thành stories để chọn
      </label>
      <p className="text-xs text-muted-foreground">
        Bạn sẽ duyệt plan trước khi agent bắt đầu sửa code.
      </p>
      <Button
        type="submit"
        disabled={busy || !configured || !repoId}
        className="w-full"
        size="lg"
      >
        Tạo task
      </Button>
    </form>
  );
}
