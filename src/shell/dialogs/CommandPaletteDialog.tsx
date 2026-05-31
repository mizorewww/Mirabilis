import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export type CommandPaletteCommand = {
  readonly id: string;
  readonly title: string;
  readonly contextLabels: readonly string[];
  readonly defaultShortcut?: string;
  readonly description?: string;
};

type CommandPaletteDialogProps = {
  commands: readonly CommandPaletteCommand[];
  onClose(): void;
  onExecute(commandId: string): Promise<void>;
  open: boolean;
};

export function CommandPaletteDialog({
  commands,
  onClose,
  onExecute,
  open,
}: CommandPaletteDialogProps) {
  const [errorVisible, setErrorVisible] = useState(false);
  const [pendingCommandId, setPendingCommandId] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  const visibleCommands = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );
  const canRunCommand = pendingCommandId === undefined;

  const closeDialog = () => {
    setErrorVisible(false);
    setPendingCommandId(undefined);
    setQuery("");
    onClose();
  };

  const runCommand = async (command: CommandPaletteCommand) => {
    if (!canRunCommand) {
      return;
    }

    setErrorVisible(false);
    setPendingCommandId(command.id);

    try {
      await onExecute(command.id);
      closeDialog();
    } catch {
      setErrorVisible(true);
      setPendingCommandId(undefined);
    }
  };

  return (
    <Dialog
      aria-labelledby="command-palette-title"
      fullWidth
      maxWidth="sm"
      onClose={canRunCommand ? closeDialog : undefined}
      open={open}
      transitionDuration={0}
    >
      <DialogTitle id="command-palette-title">Command Palette</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            label="Command search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || visibleCommands[0] === undefined) {
                return;
              }

              event.preventDefault();
              void runCommand(visibleCommands[0]);
            }}
            value={query}
          />

          {errorVisible ? (
            <Alert severity="error">Command could not run.</Alert>
          ) : null}

          <List aria-label="Commands" dense>
            {visibleCommands.length > 0 ? (
              visibleCommands.map((command, index) => (
                <ListItemButton
                  disabled={!canRunCommand}
                  key={command.id}
                  onClick={() => void runCommand(command)}
                  selected={index === 0}
                >
                  <ListItemText
                    primary={command.title}
                    secondary={<CommandPaletteCommandMetadata command={command} />}
                  />
                </ListItemButton>
              ))
            ) : (
              <Box component="li">
                <Typography color="text.secondary" variant="body2">
                  No matching commands
                </Typography>
              </Box>
            )}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={!canRunCommand} onClick={closeDialog}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CommandPaletteCommandMetadata({
  command,
}: {
  command: CommandPaletteCommand;
}) {
  const metadata = [
    command.description,
    command.defaultShortcut,
    ...command.contextLabels,
  ].filter((value): value is string => value !== undefined && value.length > 0);

  if (metadata.length === 0) {
    return null;
  }

  return (
    <Box component="span">
      {metadata.map((value, index) => (
        <Typography
          color="text.secondary"
          component="span"
          key={`${value}:${index}`}
          variant="body2"
        >
          {index === 0 ? value : ` ${value}`}
        </Typography>
      ))}
    </Box>
  );
}

function filterCommands(
  commands: readonly CommandPaletteCommand[],
  query: string,
): CommandPaletteCommand[] {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length === 0) {
    return [...commands];
  }

  return commands.filter((command) =>
    getCommandSearchParts(command).some((part) =>
      normalizeSearchText(part).includes(normalizedQuery),
    ),
  );
}

function getCommandSearchParts(command: CommandPaletteCommand): string[] {
  return [
    command.title,
    command.description ?? "",
    command.defaultShortcut ?? "",
    ...command.contextLabels,
  ];
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}
