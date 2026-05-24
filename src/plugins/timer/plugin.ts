import type { AppPlugin } from "../../core";
import { TimerMetadataPlaceholder } from "./components/TimerMetadataPlaceholder";

const timerMetadataSlotId = "timer.page-header-metadata.placeholder";
const pageHeaderMetadataSlot = "page.header.metadata";

export const TimerPlugin: AppPlugin = {
  manifest: {
    id: "timer",
    name: "Timer Plugin",
    version: "1.0.0",
    description: "Reserve an inert timer metadata placeholder.",
    minAppVersion: "0.1.0",
  },
  register(ctx) {
    ctx.slots.register({
      id: timerMetadataSlotId,
      slot: pageHeaderMetadataSlot,
      order: 400,
      component: TimerMetadataPlaceholder,
    });
  },
};
