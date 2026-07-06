import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handlePageShowForTest } from "./main";

describe("pageshow BFCache/back-forward restore handler", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let assignSpy: ReturnType<typeof vi.fn>;
  let replaceSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  let originalHref: string;

  beforeEach(() => {
    originalLocation = window.location;
    originalHref = window.location.href;
    reloadSpy = vi.fn();
    assignSpy = vi.fn();
    replaceSpy = vi.fn();
    // Redefine location with reload/assign/replace spies but keep href readable.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href: originalHref,
        pathname: "/game/abc-123",
        reload: reloadSpy,
        assign: assignSpy,
        replace: replaceSpy,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  function makeEvent(persisted: boolean): PageTransitionEvent {
    // jsdom lacks a full PageTransitionEvent constructor; fake the shape.
    return { persisted, type: "pageshow" } as unknown as PageTransitionEvent;
  }

  it("A. BFCache restore does not reload, navigate, or unmount", () => {
    const resumeListener = vi.fn();
    window.addEventListener("app:page-resumed", resumeListener);
    const routeBefore = window.location.pathname;

    handlePageShowForTest(makeEvent(true));

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(routeBefore);
    expect(resumeListener).toHaveBeenCalledTimes(1);
    const evt = resumeListener.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toMatchObject({ persisted: true });

    window.removeEventListener("app:page-resumed", resumeListener);
  });

  it("B. back_forward navigation restore does not reload, navigate, or unmount", () => {
    const resumeListener = vi.fn();
    window.addEventListener("app:page-resumed", resumeListener);
    const routeBefore = window.location.pathname;

    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "back_forward" } as unknown as PerformanceEntry,
    ]);

    handlePageShowForTest(makeEvent(false));

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(routeBefore);
    expect(resumeListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("app:page-resumed", resumeListener);
  });

  it("normal pageshow (not persisted, not back_forward) is a no-op", () => {
    const resumeListener = vi.fn();
    window.addEventListener("app:page-resumed", resumeListener);

    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { type: "navigate" } as unknown as PerformanceEntry,
    ]);

    handlePageShowForTest(makeEvent(false));

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(resumeListener).not.toHaveBeenCalled();

    window.removeEventListener("app:page-resumed", resumeListener);
  });
});
