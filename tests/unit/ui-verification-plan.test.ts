import { test, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  UiVerificationPlan,
  ScreenshotLinks,
} from "../../src/components/organisms/task-detail/ui-verification";
import { planFixture } from "../support/task-fixture";
(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("approved UI plan exposes viewports, mapped criteria and reference to the user", () => {
  const plan = planFixture({
    uiVerification: {
      screenshots: [
        {
          id: "mobile",
          checkId: "feature-unit",
          path: "evidence/mobile.png",
          criterionIds: ["AC-1"],
          viewport: { width: 390, height: 844 },
          referencePath: "design/mobile.png",
        },
      ],
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(UiVerificationPlan, { plan }),
  );
  expect(html).toContain("390");
  expect(html).toContain("844");
  expect(html).toContain("AC-1");
  expect(html).toContain("design/mobile.png");
  expect(
    renderToStaticMarkup(
      React.createElement(UiVerificationPlan, { plan: planFixture() }),
    ),
  ).toBe("");
});

test("saved screenshots are accessible as local artifact links without exposing unrelated context", () => {
  const html = renderToStaticMarkup(
    React.createElement(ScreenshotLinks, {
      artifacts: [
        { id: "shot:1", type: "screenshot" },
        { id: "context", type: "context" },
      ],
    }),
  );
  expect(html).toContain("/api/artifacts/shot%3A1");
  expect(html).not.toContain("/api/artifacts/context");
});
