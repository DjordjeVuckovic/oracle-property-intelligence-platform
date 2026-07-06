"use client";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[840px] px-6 pb-16">
      <PageHeader
        eyebrow="Runtime error"
        title="This view could not load"
        description="The app caught the failure so you can retry without losing navigation context."
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-muted-foreground">
            {error.digest ? `Error digest: ${error.digest}` : "The request failed before the view could render."}
          </p>
          <Button type="button" onClick={reset}>
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
