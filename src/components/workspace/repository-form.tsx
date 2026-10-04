import type { FormEvent } from "react";
export function RepositoryForm({
  onSubmit,
  busy,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
}) {
  return (
    <details className="panel repo-panel">
      <summary>+ Đăng ký repository</summary>
      <form onSubmit={onSubmit}>
        <label>
          Đường dẫn repo
          <input
            name="path"
            placeholder="/Users/you/projects/my-app"
            required
          />
        </label>
        <label>
          Nhánh nguồn
          <input name="base" defaultValue="main" required />
        </label>
        <label>
          Remote (để trống nếu local)
          <input name="remote" placeholder="origin" />
        </label>
        <button disabled={busy}>Đăng ký repo</button>
      </form>
    </details>
  );
}
