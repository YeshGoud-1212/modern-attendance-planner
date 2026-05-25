/**
 * hooks/useAttendance.js
 * Manages attendance data loading from backend.
 * Falls back to extension storage if backend is unavailable.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchLatestAttendance, readExtensionData, checkBackendHealth } from "@/services/api";

export function useAttendance() {
  const [data, setData]               = useState(null);      
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);      
  const [backendOk, setBackendOk]     = useState(null);      

  // Check backend health once on mount
  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Try backend first (primary source)
    let result = await fetchLatestAttendance();
    
    // Fallback to extension storage
    if (!result) {
      result = await readExtensionData();
    }

    if (result) {
      setData(result.data);
      setLastUpdated(result.lastUpdated);
      setError(null);
    } else {
      setError("NO_DATA");
    }

    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 3s for fresh data (reduced from 5s for quicker updates)
  useEffect(() => {
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, lastUpdated, loading, error, backendOk, refresh };
}
