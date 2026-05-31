import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

type QuickCaptureDialogProps = {
  onClose(): void;
  onSave(markdown: string): Promise<void>;
  onSaveAndOpen(markdown: string): Promise<void>;
  open: boolean;
};

type PendingAction = "save" | "save-and-open";

export function QuickCaptureDialog({
  onClose,
  onSave,
  onSaveAndOpen,
  open,
}: QuickCaptureDialogProps) {
  const [errorVisible, setErrorVisible] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>();

  const trimmedMarkdown = markdown.trim();
  const isPending = pendingAction !== undefined;
  const canSubmit = trimmedMarkdown.length > 0 && !isPending;

  const resetDialog = () => {
    setErrorVisible(false);
    setMarkdown("");
    setPendingAction(undefined);
  };

  const closeDialog = () => {
    if (!isPending) {
      resetDialog();
      onClose();
    }
  };

  const submit = async (action: PendingAction) => {
    if (!canSubmit) {
      return;
    }

    setErrorVisible(false);
    setPendingAction(action);

    try {
      if (action === "save") {
        await onSave(markdown);
      } else {
        await onSaveAndOpen(markdown);
      }

      resetDialog();
      onClose();
    } catch {
      setErrorVisible(true);
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <Dialog
      aria-labelledby="quick-capture-title"
      fullWidth
      maxWidth="sm"
      onClose={closeDialog}
      open={open}
      transitionDuration={0}
    >
      <DialogTitle id="quick-capture-title">Quick Capture</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            label="Markdown"
            minRows={7}
            multiline
            onChange={(event) => setMarkdown(event.target.value)}
            value={markdown}
          />

          {isPending ? (
            <Box aria-label="Quick Capture save" role="status">
              Saving Quick Capture
            </Box>
          ) : null}

          {errorVisible ? (
            <Alert severity="error">Capture could not save.</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={isPending} onClick={closeDialog}>
          Cancel
        </Button>
        <Button
          disabled={!canSubmit}
          onClick={() => void submit("save")}
          style={{ pointerEvents: "auto" }}
        >
          Save
        </Button>
        <Button
          disabled={!canSubmit}
          onClick={() => void submit("save-and-open")}
          style={{ pointerEvents: "auto" }}
          variant="contained"
        >
          Save and open
        </Button>
      </DialogActions>
    </Dialog>
  );
}
