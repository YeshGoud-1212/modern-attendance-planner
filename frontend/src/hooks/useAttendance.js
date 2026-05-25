/**
 * hooks/useAttendance.js
 * Loads attendance from: Chrome extension → backend cache → localStorage.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { loadAttendanceData, checkBackendHealth } from "@/services/api";

export function useAttendance() {
  const [searchParams] = useSearchParams();
  const roll = searchParams.get("roll")?.trim().toUpperCase() || null;

  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendOk, setBackendOk] = useState(null);

  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await loadAttendanceData(roll);

      if (result?.data) {
        setData(result.data);
        setLastUpdated(result.lastUpdated ?? null);
        setDataSource(result.source ?? null);
        setError(null);
      } else {
        setData(null);
        setError("NO_DATA");
      }
    } catch (e) {
      setData(null);
      setError(e.message || "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }, [roll]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, lastUpdated, loading, error, backendOk, dataSource, refresh, roll };
}
