import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

interface SystemChangeLog {
  id: string;
  domain: string;
  action: string;
  key: string;
  provider: string | null;
  isSecret: boolean;
  actorUserId: string | null;
  createdAt: string;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SystemChanges() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ logs: SystemChangeLog[] }>({
    queryKey: ["/api/admin/system-changes", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("key", search.trim());
      params.set("limit", "500");
      return apiRequest(`/api/admin/system-changes?${params.toString()}`, { method: "GET" });
    },
  });

  return (
    <QuizAdminLayout
      title="System Changes"
      description="Critical settings and integration change history"
      activeSection="system-changes"
    >
      <Card>
        <CardHeader>
          <CardTitle>System Change Audit Log</CardTitle>
          <CardDescription>Immutable history of important settings updates across cloud and onprem runtimes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="keyFilter">Filter by key or fragment</Label>
            <Input
              id="keyFilter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="INTEGRATION_..."
            />
          </div>

          {isLoading && <div className="text-sm text-muted-foreground">Loading system changes...</div>}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Domain</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Key</th>
                  <th className="px-3 py-2 text-left">Secret</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs || []).map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-3 py-2">{formatDate(log.createdAt)}</td>
                    <td className="px-3 py-2">{log.domain}</td>
                    <td className="px-3 py-2">{log.action}</td>
                    <td className="px-3 py-2">{log.provider || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{log.key}</td>
                    <td className="px-3 py-2">{log.isSecret ? "yes" : "no"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{log.actorUserId || "system"}</td>
                  </tr>
                ))}
                {(!data?.logs || data.logs.length === 0) && !isLoading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No system change events found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </QuizAdminLayout>
  );
}
