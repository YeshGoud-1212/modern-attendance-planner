/**
 * components/NoDataPrompt.jsx
 * Shown on Dashboard when no attendance data is available.
 * Guides user to open portal → run extension → return to dashboard.
 */

import { ExternalLink, RefreshCw, AlertCircle, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";

const PORTAL_URL = "https://automation.vnrvjiet.ac.in/eduprime3";

const NoDataPrompt = ({ backendOk, onRefresh }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Backend status warning */}
        {backendOk === false && (
          <div className="glass-card mb-6 border border-destructive/40 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <h3 className="text-lg font-bold text-destructive mb-2">Backend Not Running</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The Atten-Track server is not reachable at{" "}
              <span className="font-mono text-primary">localhost:8000</span>.
            </p>
            <div className="bg-muted/30 rounded-xl p-4 text-left text-sm font-mono text-muted-foreground">
              <p className="text-xs text-accent mb-2"># Start the backend server:</p>
              <p>cd backend</p>
              <p>pip install -r requirements.txt</p>
              <p>python main.py</p>
            </div>
          </div>
        )}

        {/* Main prompt */}
        <div className="glass-card hover-lift text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full glass neon-glow mb-6">
            <Chrome className="h-10 w-10 text-primary animate-glow" />
          </div>

          <h2 className="text-3xl font-bold neon-text mb-4">
            No Attendance Data Yet
          </h2>

          <p className="text-muted-foreground text-base mb-8">
            To load your real attendance, follow these 3 steps:
          </p>

          {/* Steps */}
          <div className="space-y-4 text-left mb-8">
            <div className="flex gap-4 items-start glass p-4 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold">
                1
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Open the College Portal</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Log into your VNR EduPrime account normally.
                </p>
                <a
                  href={PORTAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent mt-2 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open VNR Portal
                </a>
              </div>
            </div>

            <div className="flex gap-4 items-start glass p-4 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold">
                2
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Click the Extension Icon</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click the <strong>Atten-Track</strong> icon in your Chrome toolbar, then press{" "}
                  <strong>⚡ Fetch Attendance</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start glass p-4 rounded-2xl">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold">
                3
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Return Here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The dashboard will auto-refresh within 5 seconds.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="neon"
              size="xl"
              className="flex-1"
              onClick={() => window.open(PORTAL_URL, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              Open Portal
            </Button>
            <Button variant="glass" size="xl" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoDataPrompt;
