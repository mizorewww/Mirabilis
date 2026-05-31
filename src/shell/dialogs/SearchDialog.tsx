import { useState } from "react";
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

  const canSubmit = !pending;

  const resetDialog = () => {
    setErrorVisible(false);
    setPending(false);
    setQuery("");
  };

  const closeDialog = () => {
    if (!pending) {
      resetDialog();
      onClose();
    }
  };

  const submit = async () => {
    if (!canSubmit) {
      return;
    }

    const boundedQuery = query.slice(0, maxSearchQueryLength);

    setErrorVisible(false);
    setPending(true);

    try {
      await onSearch(boundedQuery);
      resetDialog();
      onClose();
    } catch {
      setErrorVisible(true);
    } finally {
      setPending(false);
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
          <Button disabled={pending} onClick={closeDialog} type="button">
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
