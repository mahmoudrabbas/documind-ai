// @vitest-environment jsdom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { usePlatformQuery } from "./use-platform-query";

type QueryParams = { page: number };
type QueryData = number[];
type Loader = (
  params: QueryParams,
  signal?: AbortSignal,
) => Promise<{ data: QueryData }>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let result: ReturnType<typeof usePlatformQuery<QueryParams, QueryData>> | undefined;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function Probe({ loader, params }: { loader: Loader; params: QueryParams }) {
  // eslint-disable-next-line react-hooks/globals -- Test harness: capture the hook result into an outer variable for assertions.
  result = usePlatformQuery(loader, params);
  return null;
}

async function mountProbe(props: { loader: Loader; params: QueryParams }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(createElement(Probe, props));
  });
}

async function rerenderProbe(props: { loader: Loader; params: QueryParams }) {
  const root = mountedRoots[mountedRoots.length - 1];
  await act(async () => {
    root.render(createElement(Probe, props));
  });
}

/** Flush pending microtasks (promise resolution → setState) inside act. */
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  result = undefined;
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

describe("usePlatformQuery", () => {
  it("starts loading and then resolves to data", async () => {
    const gate = deferred<{ data: QueryData }>();
    const loader = vi.fn(() => gate.promise);

    await mountProbe({ loader, params: { page: 1 } });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result?.loading).toBe(true);
    expect(result?.refreshing).toBe(false);
    expect(result?.data).toBeNull();
    expect(result?.error).toBe("");

    await act(async () => {
      gate.resolve({ data: [1, 2, 3] });
    });
    await flushMicrotasks();

    expect(result?.loading).toBe(false);
    expect(result?.refreshing).toBe(false);
    expect(result?.data).toEqual([1, 2, 3]);
    expect(result?.error).toBe("");
  });

  it("refetches when params change, passing the new params to the loader", async () => {
    const loader = vi.fn((params: QueryParams) =>
      Promise.resolve({ data: [params.page] }),
    );

    await mountProbe({ loader, params: { page: 1 } });
    await flushMicrotasks();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0][0]).toEqual({ page: 1 });
    expect(result?.data).toEqual([1]);

    await rerenderProbe({ loader, params: { page: 2 } });
    await flushMicrotasks();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls[1][0]).toEqual({ page: 2 });
    expect(result?.data).toEqual([2]);
    expect(result?.loading).toBe(false);
  });

  it("ignores a stale response that resolves after a newer one", async () => {
    const first = deferred<{ data: QueryData }>();
    const second = deferred<{ data: QueryData }>();
    let callCount = 0;
    const loader = vi.fn(() => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    await mountProbe({ loader, params: { page: 1 } });
    expect(loader).toHaveBeenCalledTimes(1);

    await rerenderProbe({ loader, params: { page: 2 } });
    expect(loader).toHaveBeenCalledTimes(2);

    // The newer (page 2) request lands first.
    await act(async () => {
      second.resolve({ data: [2] });
    });
    await flushMicrotasks();
    expect(result?.data).toEqual([2]);
    expect(result?.loading).toBe(false);

    // The aborted (page 1) request resolves late and must be ignored.
    await act(async () => {
      first.resolve({ data: [1] });
    });
    await flushMicrotasks();

    expect(result?.data).toEqual([2]);
  });

  it("keeps previous data visible while refreshing after a param change", async () => {
    const first = deferred<{ data: QueryData }>();
    const second = deferred<{ data: QueryData }>();
    let callCount = 0;
    const loader = vi.fn(() => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    await mountProbe({ loader, params: { page: 1 } });
    await act(async () => {
      first.resolve({ data: [1] });
    });
    await flushMicrotasks();
    expect(result?.data).toEqual([1]);
    expect(result?.loading).toBe(false);
    expect(result?.refreshing).toBe(false);

    await rerenderProbe({ loader, params: { page: 2 } });

    // Previous rows stay mounted while the refetch is in flight.
    expect(result?.data).toEqual([1]);
    expect(result?.refreshing).toBe(true);
    expect(result?.loading).toBe(false);

    await act(async () => {
      second.resolve({ data: [2] });
    });
    await flushMicrotasks();

    expect(result?.data).toEqual([2]);
    expect(result?.refreshing).toBe(false);
  });

  it("reload() re-fetches with the current params, keeping data visible", async () => {
    const first = deferred<{ data: QueryData }>();
    const second = deferred<{ data: QueryData }>();
    let callCount = 0;
    const loader = vi.fn((_params: QueryParams) => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    await mountProbe({ loader, params: { page: 3 } });
    await act(async () => {
      first.resolve({ data: [1] });
    });
    await flushMicrotasks();
    expect(result?.data).toEqual([1]);
    expect(loader.mock.calls[0][0]).toEqual({ page: 3 });

    await act(async () => {
      result?.reload();
    });

    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls[1][0]).toEqual({ page: 3 });
    expect(result?.data).toEqual([1]);
    expect(result?.refreshing).toBe(true);

    await act(async () => {
      second.resolve({ data: [2] });
    });
    await flushMicrotasks();

    expect(result?.data).toEqual([2]);
    expect(result?.refreshing).toBe(false);
    expect(result?.loading).toBe(false);
  });
});
