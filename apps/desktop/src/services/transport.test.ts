import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockBackend } from "./mocks/backend";
import { createMockTransport } from "./transport";
import { MorphoError } from "./errors";
import { setTransport, resetTransport, getTransport } from "./transportProvider";

/**
 * Transport boundary checks (UI-04): success paths return schema-validated
 * data; failures become typed MorphoError; cancellation aborts cleanly;
 * response validation catches contract drift.
 */

const transport = createMockTransport({ delayMs: 0 });

beforeEach(() => {
  mockBackend.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTransport();
});

describe("mock transport", () => {
  it("returns validated data on success", async () => {
    const projects = await transport.invoke("project.list", {});
    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  it("converts backend errors into typed MorphoError values", async () => {
    mockBackend.armFault({});
    const error = await transport.invoke("project.list", {}).catch((e) => e);
    expect(error).toBeInstanceOf(MorphoError);
    expect((error as MorphoError).code).toBe("DATABASE_ERROR");
    expect((error as MorphoError).retryable).toBe(true);
    expect((error as MorphoError).correlationId).toBeTruthy();
  });

  it("targets fault injection at a single command", async () => {
    mockBackend.armFault({ command: "project.list", payload: { code: "WORKER_NOT_AVAILABLE" } });
    await expect(transport.invoke("project.list", {})).rejects.toMatchObject({
      code: "WORKER_NOT_AVAILABLE",
    });
    await expect(transport.invoke("config.get", { project_id: mockBackend.handle("project.list", {})[0].id })).resolves.toBeTruthy();
  });

  it("aborts an in-flight request when the signal fires", async () => {
    const slow = createMockTransport({ delayMs: 200 });
    const controller = new AbortController();
    const pending = slow.invoke("project.list", {}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport.invoke("project.list", {}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails with VALIDATION_FAILED when a response drifts from the schema", async () => {
    const spy = vi.spyOn(mockBackend, "handle").mockReturnValueOnce({
      // Intentionally contract-breaking payload for the registry to catch.
      not_a_project: true,
    } as never);
    setTransport(createMockTransport({ delayMs: 0 }));
    await expect(getTransport().invoke("project.list", {})).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    spy.mockRestore();
  });
});
