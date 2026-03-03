"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import type { Setting } from "@/types";

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {};
      (settings as Setting[]).forEach((s) => {
        vals[s.key] = s.value;
      });
      setValues(vals);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(values, {
      onSuccess: () => setDirty(false),
    });
  };

  return (
    <>
      <Topbar
        title="Settings"
        subtitle="System configuration (admin only)"
        actions={
          dirty ? (
            <Button onClick={handleSave} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Changes"}
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {isLoading ? (
          <Card>
            <div className="text-xs text-txt-light py-8 text-center">Loading settings...</div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="System Settings" subtitle="Key-value configuration" />
            {updateSettings.isSuccess && (
              <div className="bg-green-bg border border-green/30 rounded-md px-3 py-2 mb-4 text-xs text-green">
                Settings saved successfully
              </div>
            )}
            <div className="space-y-3">
              {(settings as Setting[] ?? []).map((s) => (
                <div key={s.key} className="grid grid-cols-[200px_1fr] gap-3 items-center">
                  <div>
                    <div className="text-xs font-semibold text-txt font-mono">{s.key}</div>
                    {s.description && (
                      <div className="text-[10px] text-txt-light mt-0.5">{s.description}</div>
                    )}
                  </div>
                  <Input
                    value={values[s.key] ?? ""}
                    onChange={(e) => {
                      setValues({ ...values, [s.key]: e.target.value });
                      setDirty(true);
                    }}
                  />
                </div>
              ))}
              {(!settings || (settings as Setting[]).length === 0) && (
                <div className="text-xs text-txt-light py-4 text-center">
                  No settings configured
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
