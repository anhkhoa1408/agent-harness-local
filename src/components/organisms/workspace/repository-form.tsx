"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/molecules/form-field";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
export function RepositoryForm({
  onSubmit,
  busy,
  draft,
  onDraftChange,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
  draft: { path: string; base: string; remote: string };
  onDraftChange: (field: "path" | "base" | "remote", value: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  async function browse() {
    setPicking(true);
    setError("");
    try {
      const result = await api<{ path: string | null }>(
        "repositories/pick-folder",
        "POST",
      );
      if (result.path !== null) onDraftChange("path", result.path);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(
        code === "folder_picker_unsupported"
          ? "Chọn thư mục hiện hỗ trợ macOS. Bạn có thể nhập đường dẫn bên dưới."
          : code === "folder_picker_busy"
            ? "Hộp thoại chọn thư mục đang mở. Hãy chọn hoặc hủy trong hộp thoại đó."
            : "Không thể mở hộp thoại chọn thư mục. Hãy thử lại hoặc nhập đường dẫn bên dưới.",
      );
    } finally {
      setPicking(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Button
        variant="outline"
        type="button"
        onClick={browse}
        disabled={busy || picking}
      >
        <FolderOpen aria-hidden="true" />
        {picking ? "Đang chọn thư mục…" : "Chọn thư mục…"}
      </Button>
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
      <FormField id="repo-path" label="Đường dẫn repo">
        <Input
          id="repo-path"
          name="path"
          value={draft.path}
          onChange={(event) => onDraftChange("path", event.target.value)}
          disabled={picking}
          placeholder="/Users/you/projects/my-app"
          required
        />
      </FormField>
      <FormField id="repo-base" label="Nhánh nguồn">
        <Input
          id="repo-base"
          name="base"
          value={draft.base}
          onChange={(event) => onDraftChange("base", event.target.value)}
          required
        />
      </FormField>
      <FormField id="repo-remote" label="Remote (để trống nếu local)">
        <Input
          id="repo-remote"
          name="remote"
          placeholder="origin"
          value={draft.remote}
          onChange={(event) => onDraftChange("remote", event.target.value)}
        />
      </FormField>
      <Button variant="secondary" type="submit" disabled={busy || picking}>
        Đăng ký repo
      </Button>
    </form>
  );
}
