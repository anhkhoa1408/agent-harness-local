import { type Plan, type Story, type StorySelection } from "./contracts";

export function validateStories(plan: Plan): string[] {
  if (!plan.stories) return [];
  const stories = plan.stories,
    errors: string[] = [],
    ids = new Set(stories.map((s) => s.id));
  if (ids.size !== stories.length) errors.push("story_duplicate_id");
  for (const s of stories) {
    if (s.dependsOn.some((id) => !ids.has(id) || id === s.id))
      errors.push(`story_dependency:${s.id}`);
    if (new Set(s.dependsOn).size !== s.dependsOn.length)
      errors.push(`story_duplicate_dependency:${s.id}`);
    for (const [mapping, source] of [
      [s.criterionIds, plan.criteria],
      [s.stepIds, plan.steps],
    ] as const)
      if (
        !mapping.length ||
        new Set(mapping).size !== mapping.length ||
        mapping.some((id) => !source.some((x) => x.id === id))
      )
        errors.push(`story_mapping:${s.id}`);
  }
  for (const [key, source] of [
    ["criterionIds", plan.criteria],
    ["stepIds", plan.steps],
  ] as const)
    for (const item of source)
      if (stories.filter((s) => s[key].includes(item.id)).length !== 1)
        errors.push(`story_coverage:${item.id}`);
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) {
      errors.push("story_cycle");
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stories.find((s) => s.id === id)?.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  stories.forEach((s) => visit(s.id));
  for (const step of plan.steps) {
    const owner = stories.find((s) => s.stepIds.includes(step.id));
    for (const dependency of step.dependsOn) {
      const other = stories.find((s) => s.stepIds.includes(dependency));
      if (!other || (other !== owner && !owner?.dependsOn.includes(other.id)))
        errors.push(`story_step_dependency:${step.id}`);
    }
  }
  return [...new Set(errors)];
}
export function selectedStories(plan: Plan, raw: StorySelection): Story[] {
  const selection = raw;
  if (selection.planVersion !== plan.version) throw new Error("stale_plan");
  const errors = validateStories(plan);
  if (errors.length || !plan.stories)
    throw new Error(`invalid_stories:${errors.join(",")}`);
  const ids = new Set(selection.storyIds);
  if (
    ids.size !== selection.storyIds.length ||
    selection.storyIds.some((id) => !plan.stories!.some((s) => s.id === id))
  )
    throw new Error("invalid_story_selection");
  const remaining = plan.stories.filter((s) => ids.has(s.id)),
    ordered: Story[] = [];
  if (remaining.some((s) => s.dependsOn.some((id) => !ids.has(id))))
    throw new Error("story_dependency_required");
  while (remaining.length) {
    const index = remaining.findIndex((s) =>
      s.dependsOn.every((id) => ordered.some((o) => o.id === id)),
    );
    if (index < 0) throw new Error("story_cycle");
    ordered.push(...remaining.splice(index, 1));
  }
  return ordered;
}
function project(plan: Plan, stories: Story[], baselineCommit: string): Plan {
  const criterionIds = new Set(stories.flatMap((s) => s.criterionIds)),
    stepIds = new Set(stories.flatMap((s) => s.stepIds));
  const criteria = plan.criteria.filter((c) => criterionIds.has(c.id));
  const checkIds = new Set(criteria.flatMap((c) => c.checkIds));
  const screenshots =
    plan.uiVerification?.screenshots.filter((s) =>
      s.criterionIds.every((id) => criterionIds.has(id)),
    ) ?? [];
  screenshots.forEach((s) => checkIds.add(s.checkId));
  // Unmapped required checks are global; selecting stories must not silently skip them.
  const mappedCheckIds = new Set(plan.criteria.flatMap((c) => c.checkIds));
  plan.checks
    .filter(
      (c) =>
        c.required &&
        (!mappedCheckIds.has(c.id) || ["build", "typecheck"].includes(c.kind)),
    )
    .forEach((c) => checkIds.add(c.id));
  return {
    ...plan,
    stories: undefined,
    sourceCommit: baselineCommit,
    scope: stories.length === 1 ? stories[0].outcome : plan.scope,
    criteria,
    steps: plan.steps
      .filter((s) => stepIds.has(s.id))
      .map((s) => ({
        ...s,
        dependsOn: s.dependsOn.filter((id) => stepIds.has(id)),
      })),
    checks: plan.checks.filter((c) => checkIds.has(c.id)),
    uiVerification: screenshots.length ? { screenshots } : null,
  };
}
export function projectStoryPlan(
  plan: Plan,
  storyId: string,
  baselineCommit: string,
): Plan {
  const story = plan.stories?.find((s) => s.id === storyId);
  if (!story) throw new Error("story_not_found");
  return project(plan, [story], baselineCommit);
}
export function projectSelectedPlan(
  plan: Plan,
  selection: StorySelection,
): Plan {
  return project(plan, selectedStories(plan, selection), plan.sourceCommit);
}
