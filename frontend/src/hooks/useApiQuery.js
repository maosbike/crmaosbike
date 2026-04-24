import { useState, useEffect, useRef, useCallback } from 'react';

export function useApiQuery(fetcher, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const epochRef = useRef(0);

  const run = useCallback(async (epoch) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (epoch === epochRef.current) {
        setData(result);
      }
    } catch (e) {
      if (epoch === epochRef.current && e?.name !== 'AbortError') {
        setError(e);
      }
    } finally {
      if (epoch === epochRef.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const epoch = ++epochRef.current;
    run(epoch);
    return () => {
      epochRef.current++;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => {
    const epoch = ++epochRef.current;
    run(epoch);
  }, [run]);

  return { data, loading, error, refetch };
}
