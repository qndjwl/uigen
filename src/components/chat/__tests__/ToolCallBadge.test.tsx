import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolCallBadge, getToolLabel } from "../ToolCallBadge";

afterEach(() => {
  cleanup();
});

// getToolLabel

test("getToolLabel: str_replace_editor create", () => {
  expect(getToolLabel("str_replace_editor", { command: "create", path: "/components/Card.jsx" })).toBe("Creating Card.jsx");
});

test("getToolLabel: str_replace_editor str_replace", () => {
  expect(getToolLabel("str_replace_editor", { command: "str_replace", path: "/App.jsx" })).toBe("Editing App.jsx");
});

test("getToolLabel: str_replace_editor insert", () => {
  expect(getToolLabel("str_replace_editor", { command: "insert", path: "/App.jsx" })).toBe("Editing App.jsx");
});

test("getToolLabel: str_replace_editor view", () => {
  expect(getToolLabel("str_replace_editor", { command: "view", path: "/App.jsx" })).toBe("Viewing App.jsx");
});

test("getToolLabel: file_manager rename", () => {
  expect(getToolLabel("file_manager", { command: "rename", path: "/old.jsx" })).toBe("Renaming old.jsx");
});

test("getToolLabel: file_manager delete", () => {
  expect(getToolLabel("file_manager", { command: "delete", path: "/App.jsx" })).toBe("Deleting App.jsx");
});

test("getToolLabel: unknown tool falls back to tool name", () => {
  expect(getToolLabel("some_other_tool", {})).toBe("some_other_tool");
});

test("getToolLabel: extracts filename from nested path", () => {
  expect(getToolLabel("str_replace_editor", { command: "create", path: "/src/components/Button.tsx" })).toBe("Creating Button.tsx");
});

// ToolCallBadge component

test("ToolCallBadge shows label and green dot when done", () => {
  render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "str_replace_editor", args: { command: "create", path: "/App.jsx" }, state: "result", result: "ok" }}
    />
  );
  expect(screen.getByText("Creating App.jsx")).toBeDefined();
  expect(document.querySelector(".bg-emerald-500")).toBeDefined();
  expect(document.querySelector(".animate-spin")).toBeNull();
});

test("ToolCallBadge shows spinner when in-progress", () => {
  render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "str_replace_editor", args: { command: "str_replace", path: "/App.jsx" }, state: "call" }}
    />
  );
  expect(screen.getByText("Editing App.jsx")).toBeDefined();
  expect(document.querySelector(".animate-spin")).toBeDefined();
  expect(document.querySelector(".bg-emerald-500")).toBeNull();
});

test("ToolCallBadge falls back to tool name for unknown tools", () => {
  render(
    <ToolCallBadge
      tool={{ toolCallId: "1", toolName: "unknown_tool", args: {}, state: "result", result: null }}
    />
  );
  expect(screen.getByText("unknown_tool")).toBeDefined();
});
