export type TimerMetadataPlaceholderProps = {
  pageId: string;
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

const startTimerCommandId = "timer.start";

export function TimerMetadataPlaceholder({
  pageId,
  commands,
}: TimerMetadataPlaceholderProps) {
  async function startTimer() {
    await commands.execute(startTimerCommandId, { pageId });
  }

  return (
    <section role="group" aria-label="Timer metadata">
      <button
        type="button"
        onClick={() => {
          void startTimer();
        }}
      >
        Start timer
      </button>
    </section>
  );
}
