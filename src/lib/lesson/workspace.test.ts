import { describe, it, expect } from "vitest";
import { inspectEqualGroups, describeWorkspace, toWorkspaceAttempt } from "./workspace";

const target = { groups: 4, perGroup: 6 }; // 6 × 4 = 24

describe("inspectEqualGroups", () => {
  it("marks an empty workspace incorrect", () => {
    expect(inspectEqualGroups([], target).status).toBe("incorrect");
  });

  it("marks the exact answer correct", () => {
    const ins = inspectEqualGroups([6, 6, 6, 6], target);
    expect(ins.status).toBe("correct");
    expect(ins.total).toBe(24);
  });

  it("marks progress partial", () => {
    expect(inspectEqualGroups([6, 6], target).status).toBe("partial");
    expect(inspectEqualGroups([6, 6, 6, 5], target).status).toBe("partial");
    expect(inspectEqualGroups([6, 6, 6, 6, 6], target).status).toBe("partial");
  });

  it("counts correctly sized groups", () => {
    expect(inspectEqualGroups([6, 5, 6], target).correctGroups).toBe(2);
  });
});

describe("describeWorkspace", () => {
  it("refers to the visible workspace", () => {
    expect(describeWorkspace(inspectEqualGroups([6, 6, 6, 6], target))).toContain("24");
    expect(describeWorkspace(inspectEqualGroups([6, 6], target))).toContain("another group");
  });
});

describe("toWorkspaceAttempt", () => {
  it("keeps equal-group work distinct from an array attempt", () => {
    expect(toWorkspaceAttempt("equal_groups", [4, 4, 4])).toEqual({
      kind: "equal_groups",
      groups: [4, 4, 4],
    });
  });

  it("maps array work to rows", () => {
    expect(toWorkspaceAttempt("array", [3, 3])).toEqual({ kind: "array", rows: [3, 3] });
  });
});
