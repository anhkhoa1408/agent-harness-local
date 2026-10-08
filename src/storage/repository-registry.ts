import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./database";

export function createRepositoryRegistry(db: DatabaseSync) {
  return {
    removeRepository(repositoryId: string): string[] {
      return transaction(db, () => {
        if (
          !db
            .prepare("SELECT 1 FROM records WHERE kind='repository' AND id=?")
            .get(repositoryId)
        )
          throw new Error("repository_not_found");
        const tasks = db
          .prepare(
            "SELECT id,body FROM tasks WHERE json_extract(body,'$.repositoryId')=?",
          )
          .all(repositoryId) as { id: string; body: string }[];
        for (const task of tasks) {
          const state = JSON.parse(task.body);
          const latestAttempt = db
            .prepare(
              "SELECT json_extract(body,'$.status') AS status FROM records WHERE kind='attempt' AND json_extract(body,'$.taskId')=? ORDER BY rowid DESC LIMIT 1",
            )
            .get(task.id) as { status: string } | undefined;
          const exclusion = db
            .prepare("SELECT 1 FROM records WHERE kind='exclusion' AND id=?")
            .get(task.id);
          const activeCommand = db
            .prepare(
              "SELECT 1 FROM commands WHERE task_id=? AND state='running'",
            )
            .get(task.id);
          if (
            state.status === "running" ||
            exclusion ||
            activeCommand ||
            (latestAttempt?.status === "running" &&
              state.reason !== "host_restart_confirmed")
          )
            throw new Error("repository_busy");
        }
        for (const { id } of tasks) {
          db.prepare("DELETE FROM events WHERE task_id=?").run(id);
          db.prepare("DELETE FROM commands WHERE task_id=?").run(id);
          db.prepare(
            `DELETE FROM records WHERE id=? OR substr(id,1,length(?)+1)=? || ':'
            OR json_extract(body,'$.taskId')=? OR json_extract(body,'$.featureId')=?`,
          ).run(id, id, id, id, id);
          db.prepare("DELETE FROM tasks WHERE id=?").run(id);
        }
        db.prepare(
          "DELETE FROM records WHERE kind='profile' AND (json_extract(body,'$.repositoryId')=? OR substr(id,1,length(?)+1)=? || ':')",
        ).run(repositoryId, repositoryId, repositoryId);
        db.prepare("DELETE FROM records WHERE kind='repository' AND id=?").run(
          repositoryId,
        );
        return tasks.map((task) => task.id);
      });
    },
  };
}
