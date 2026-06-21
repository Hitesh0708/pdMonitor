"use client";

import { useState } from "react";
import { Button, Card, TextArea } from "@faclon-labs/design-sdk";
import { resolveInputToBearer } from "@/auth/useAuth";

export interface TokenGateProps {
  /** Called with a validated Bearer token once the user connects. */
  onConnect: (bearer: string) => void;
  /** Optional message carried over from a failed auto-auth (e.g. expired portal link). */
  initialError?: string | null;
}

/**
 * Shown when no token auto-resolves (local / undeployed use). The user pastes an
 * IOsense token — either a one-time SSO token or a Bearer JWT — which is validated
 * and activated. When deployed, the portal supplies `?token=` and this never shows.
 */
export function TokenGate({ onConnect, initialError }: TokenGateProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await resolveInputToBearer(value);
    setBusy(false);
    if (res.token) onConnect(res.token);
    else setError(res.error ?? "Could not connect. Please try again.");
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Card width={520} maxWidth="100%">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="HeadingMediumSemibold text-lg font-semibold">Connect to IOsense</h2>
            <p className="BodyMediumRegular text-sm text-gray-500">
              Paste your IOsense <strong>SSO token</strong> (one-time, ~60&nbsp;s) or a <strong>Bearer&nbsp;JWT</strong> to load the
              dashboard. When opened from the IOsense portal, this connects automatically.
            </p>
          </div>

          <TextArea
            label="IOsense token"
            name="token"
            placeholder="5815295b…  or  Bearer eyJhbGci…"
            value={value}
            onChange={(m) => setValue(m.value)}
            maxLines={4}
            validationState={error ? "error" : "none"}
            errorText={error ?? undefined}
          />

          <div className="flex items-center justify-end">
            <Button variant="Primary" label={busy ? "Connecting…" : "Connect"} isLoading={busy} isDisabled={busy || !value.trim()} onClick={submit} />
          </div>
        </div>
      </Card>
    </div>
  );
}
