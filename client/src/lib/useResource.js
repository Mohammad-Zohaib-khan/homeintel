import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data hook: { data, error, loading, reload, setData }.
 * Aborts in-flight requests on change/unmount; keeps previous data while reloading (stale-while-revalidate).
 */
export function useResource(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const seq = useRef(0);
  const run = useCallback(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return () => {}; }
    const id = ++seq.current;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(fetcher(ctrl.signal))
      .then((data) => { if (id === seq.current) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (id === seq.current && error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') setState((s) => ({ ...s, error, loading: false })); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  useEffect(() => run(), [run]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload: run, setData };
}
