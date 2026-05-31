import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

const maxSearchQueryLength = 200;

type SearchDialogProps = {
  onClose(): void;
  onSearch(query: string): Promise<void>;
  open: boolean;
};

export function SearchDialog({
  onClose,
  onSearch,
  open,
}: SearchDialogProps) {
  const [errorVisible, setErrorVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const submissionGenerationRef = useRef(0);

  const canSubmit = !pending;

  useEffect(() => {
    if (pending) {
      cancelButtonRef.current?.focus();
    }
  }, [pending]);

  const resetDialog = () => {
    setErrorVisible(false);
    setPending(false);
    setQuery("");
  };

  const closeDialog = () => {
    submissionGenerationRef.current += 1;
    resetDialog();
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    const submissionGeneration = submissionGenerationRef.current + 1;
    const boundedQuery = query.slice(0, maxSearchQueryLength);

    submissionGenerationRef.current = submissionGeneration;
    setErrorVisible(false);
    setPending(true);

    try {
      await onSearch(boundedQuery);
      if (submissionGenerationRef.current !== submissionGeneration) {
        return;
      }

      resetDialog();
      onClose();
    } catch {
      if (submissionGenerationRef.current === submissionGeneration) {
        setErrorVisible(true);
      }
    } finally {
      if (submissionGenerationRef.current === submissionGeneration) {
        setPending(false);
      }
    }
  };

  return (
    <Dialog
      aria-labelledby="search-dialog-title"
      fullWidth
      maxWidth="sm"
      onClose={closeDialog}
      open={open}
      transitionDuration={0}
    >
      <DialogTitle id="search-dialog-title">Search</DialogTitle>
      <Box
        component="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              label="Search query"
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{
                htmlInput: {
                  maxLength: maxSearchQueryLength,
                },
              }}
              value={query}
            />

            {pending ? (
              <Box
                aria-label="Search pending"
                role="status"
                sx={{
                  alignItems: "center",
                  display: "flex",
                  gap: 1,
                }}
              >
                <CircularProgress aria-hidden size={16} />
                Searching
              </Box>
            ) : null}

            {errorVisible ? (
              <Alert severity="error">Search could not run.</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} ref={cancelButtonRef} type="button">
            Cancel
          </Button>
          <Button disabled={!canSubmit} type="submit" variant="contained">
            Search
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
