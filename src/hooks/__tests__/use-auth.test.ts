import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { useAuth } from "@/hooks/use-auth";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockProject = (id: string) => ({
  id,
  name: "Project",
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth — initial state", () => {
  it("exposes isLoading as false before any action", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes signIn and signUp as functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});

describe("useAuth — signIn", () => {
  describe("loading state", () => {
    it("sets isLoading true while the action is pending", async () => {
      let resolve: (v: any) => void;
      vi.mocked(signInAction).mockReturnValue(new Promise((r) => { resolve = r; }));

      const { result } = renderHook(() => useAuth());
      act(() => { result.current.signIn("a@b.com", "pass"); });

      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolve!({ success: false }); });
    });

    it("resets isLoading to false after a failed sign-in", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "bad"); });

      expect(result.current.isLoading).toBe(false);
    });

    it("resets isLoading to false even when signInAction throws", async () => {
      vi.mocked(signInAction).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        try { await result.current.signIn("a@b.com", "pass"); } catch { /* expected */ }
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("resets isLoading to false after a successful sign-in", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([mockProject("p1")]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("action call", () => {
    it("forwards email and password to signInAction", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false, error: "err" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("user@example.com", "secret123"); });

      expect(signInAction).toHaveBeenCalledWith("user@example.com", "secret123");
    });

    it("returns the raw result from signInAction", async () => {
      const serverResult = { success: false, error: "Invalid credentials" };
      vi.mocked(signInAction).mockResolvedValue(serverResult);

      const { result } = renderHook(() => useAuth());
      let returned: any;
      await act(async () => { returned = await result.current.signIn("a@b.com", "wrong"); });

      expect(returned).toEqual(serverResult);
    });
  });

  describe("navigation — failure", () => {
    it("does not navigate when signIn fails", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "wrong"); });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("navigation — success, no anon work", () => {
    it("redirects to the most recent project when one exists", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([
        mockProject("recent"),
        mockProject("older"),
      ]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(mockPush).toHaveBeenCalledWith("/recent");
    });

    it("creates a blank project and redirects when no projects exist", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([]);
      vi.mocked(createProject).mockResolvedValue(mockProject("new-proj") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/new-proj");
    });

    it("skips getProjects when anon messages are present", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({
        messages: [{ role: "user", content: "hi" }],
        fileSystemData: {},
      });
      vi.mocked(createProject).mockResolvedValue(mockProject("migrated") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(getProjects).not.toHaveBeenCalled();
    });
  });

  describe("navigation — success, with anon work", () => {
    const anonData = {
      messages: [{ role: "user", content: "make a button" }],
      fileSystemData: { "/": { type: "directory" } },
    };

    it("creates a project using the anon messages and file system data", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProject).mockResolvedValue(mockProject("m") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonData.messages,
          data: anonData.fileSystemData,
        })
      );
    });

    it("names the migrated project with a 'Design from ...' prefix", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProject).mockResolvedValue(mockProject("m") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      const name: string = vi.mocked(createProject).mock.calls[0][0].name;
      expect(name).toMatch(/^Design from /);
    });

    it("clears anon work after migration", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProject).mockResolvedValue(mockProject("m") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(clearAnonWork).toHaveBeenCalled();
    });

    it("redirects to the newly created project after migration", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProject).mockResolvedValue(mockProject("migrated-id") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(mockPush).toHaveBeenCalledWith("/migrated-id");
    });

    it("does not migrate when anon messages array is empty", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue({ messages: [], fileSystemData: {} });
      vi.mocked(getProjects).mockResolvedValue([mockProject("p1")]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/p1");
    });

    it("does not migrate when getAnonWorkData returns null", async () => {
      vi.mocked(signInAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([mockProject("p1")]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signIn("a@b.com", "pass"); });

      expect(clearAnonWork).not.toHaveBeenCalled();
    });
  });
});

describe("useAuth — signUp", () => {
  describe("loading state", () => {
    it("sets isLoading true while the action is pending", async () => {
      let resolve: (v: any) => void;
      vi.mocked(signUpAction).mockReturnValue(new Promise((r) => { resolve = r; }));

      const { result } = renderHook(() => useAuth());
      act(() => { result.current.signUp("new@b.com", "pass"); });

      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolve!({ success: false }); });
    });

    it("resets isLoading to false after a failed sign-up", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("taken@b.com", "pass"); });

      expect(result.current.isLoading).toBe(false);
    });

    it("resets isLoading to false even when signUpAction throws", async () => {
      vi.mocked(signUpAction).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        try { await result.current.signUp("new@b.com", "pass"); } catch { /* expected */ }
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("action call", () => {
    it("forwards email and password to signUpAction", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "err" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("new@example.com", "mypassword"); });

      expect(signUpAction).toHaveBeenCalledWith("new@example.com", "mypassword");
    });

    it("returns the raw result from signUpAction", async () => {
      const serverResult = { success: false, error: "Email already registered" };
      vi.mocked(signUpAction).mockResolvedValue(serverResult);

      const { result } = renderHook(() => useAuth());
      let returned: any;
      await act(async () => { returned = await result.current.signUp("taken@b.com", "pass"); });

      expect(returned).toEqual(serverResult);
    });
  });

  describe("navigation — failure", () => {
    it("does not navigate when signUp fails", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("taken@b.com", "pass"); });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("navigation — success", () => {
    it("runs post-sign-in logic and redirects to existing project", async () => {
      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(null);
      vi.mocked(getProjects).mockResolvedValue([mockProject("p1")]);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("new@b.com", "pass"); });

      expect(mockPush).toHaveBeenCalledWith("/p1");
    });

    it("migrates anon work on successful sign-up", async () => {
      const anonData = {
        messages: [{ role: "user", content: "create a card" }],
        fileSystemData: { "/": { type: "directory" } },
      };

      vi.mocked(signUpAction).mockResolvedValue({ success: true });
      vi.mocked(getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProject).mockResolvedValue(mockProject("anon-proj") as any);

      const { result } = renderHook(() => useAuth());
      await act(async () => { await result.current.signUp("new@b.com", "pass"); });

      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonData.messages,
          data: anonData.fileSystemData,
        })
      );
      expect(clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-proj");
    });
  });
});
