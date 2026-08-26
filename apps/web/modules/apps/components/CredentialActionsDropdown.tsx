"use client";

import { useState } from "react";

import useAddAppMutation from "@calcom/app-store/_utils/useAddAppMutation";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent } from "@calcom/ui/components/dialog";
import { Dialog } from "@calcom/ui/components/dialog";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import { showToast } from "@calcom/ui/components/toast";
import type { App } from "@calcom/types/App";

/**
 * Reconnect re-runs OAuth and asks the app's callback to repair the existing credential
 * rather than create a second one. Only callbacks that honour `reconnectCredentialId` can do
 * that; for any other app the same click would silently add a duplicate credential and leave
 * the broken one in place, so the action is offered only where it actually works. Adding an
 * app here is safe once its callback handles the reconnect state.
 */
const RECONNECT_SUPPORTED_INTEGRATION_TYPES = ["google_calendar"] as const satisfies readonly App["type"][];

interface CredentialActionsDropdownProps {
  credentialId: number;
  onSuccess?: () => void;
  delegationCredentialId?: string | null;
  disableConnectionModification?: boolean;
  integrationType?: string;
}

export default function CredentialActionsDropdown({
  credentialId,
  onSuccess,
  delegationCredentialId,
  disableConnectionModification,
  integrationType,
}: CredentialActionsDropdownProps) {
  const { t } = useLocale();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);

  // Redirects to the provider's consent screen, so there is no success path to handle here;
  // the app's OAuth callback finishes the job and returns the user to this page.
  const reconnectMutation = useAddAppMutation(null, {
    onError: (error: unknown) => {
      showToast(error instanceof Error && error.message ? error.message : t("something_went_wrong"), "error");
    },
  });

  const utils = trpc.useUtils();
  const disconnectMutation = trpc.viewer.credentials.delete.useMutation({
    onSuccess: () => {
      showToast(t("app_removed_successfully"), "success");
      onSuccess?.();
    },
    onError: () => {
      showToast(t("error_removing_app"), "error");
    },
    async onSettled() {
      await utils.viewer.calendars.connectedCalendars.invalidate();
      await utils.viewer.apps.integrations.invalidate();
    },
  });

  // A delegation credential is owned by the workspace admin, not this user, so neither
  // repairing nor removing it is theirs to do.
  const canDisconnect = !delegationCredentialId && !disableConnectionModification;
  // Matching against the allowlist rather than testing membership keeps the literal type of
  // the app type, which is what the install endpoint expects; a bare string is not assignable.
  const reconnectType = RECONNECT_SUPPORTED_INTEGRATION_TYPES.find((type) => type === integrationType);
  const canReconnect = canDisconnect && !!reconnectType;

  if (!canDisconnect) {
    return null;
  }

  return (
    <>
      <Dropdown open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="icon" color="secondary" StartIcon="ellipsis" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canReconnect && (
            <DropdownMenuItem className="outline-none">
              <DropdownItem
                type="button"
                StartIcon="rotate-cw"
                disabled={reconnectMutation.isPending}
                onClick={() => {
                  setDropdownOpen(false);
                  reconnectMutation.mutate({
                    type: reconnectType,
                    reconnectCredentialId: credentialId,
                  });
                }}>
                {t("reconnect")}
              </DropdownItem>
            </DropdownMenuItem>
          )}
          {canDisconnect && (
            <DropdownMenuItem className="outline-none">
              <DropdownItem
                type="button"
                color="destructive"
                StartIcon="trash"
                onClick={() => {
                  setDisconnectModalOpen(true);
                  setDropdownOpen(false);
                }}>
                {t("remove_app")}
              </DropdownItem>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </Dropdown>

      <Dialog open={disconnectModalOpen} onOpenChange={setDisconnectModalOpen}>
        <ConfirmationDialogContent
          variety="danger"
          title={t("remove_app")}
          confirmBtnText={t("yes_remove_app")}
          onConfirm={() => {
            disconnectMutation.mutate({ id: credentialId });
            setDisconnectModalOpen(false);
          }}>
          {t("are_you_sure_you_want_to_remove_this_app")}
        </ConfirmationDialogContent>
      </Dialog>
    </>
  );
}
