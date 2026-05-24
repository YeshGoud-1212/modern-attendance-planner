/**
 * hooks/useAttendance.js
 * Manages attendance data loading from extension storage.
 * Polls every 5 seconds for fresh data after extension runs.
 */

import { useState, useEffect, useCallback } from "react";
import { readExtensionData, checkBackendHealth } from "@/services/api";

export function useAttendance() {
  const [data, setData]               = useState(null);      // DashboardResponse from backend
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);       // string | null
  const [backendOk, setBackendOk]     = useState(null);      // null = checking

  // Check backend health once on mount
  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await readExtensionData();

    if (result) {
      setData(result.data);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } else {
      setError("NO_DATA"); // triggers the "open portal" prompt
    }

    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 5s so dashboard updates right after extension runs
  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, lastUpdated, loading, error, backendOk, refresh };
}
