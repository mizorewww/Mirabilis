import type { RegistryComponent } from "./view";

export type SlotCondition<Props = unknown> = {
  bivarianceHack(props: Props): boolean;
}["bivarianceHack"];

export type SlotContribution<Props = unknown> = {
  id: string;
  pluginId: string;
  slot: string;
  order?: number;
  when?: SlotCondition<Props>;
  component: RegistryComponent<Props>;
};

export type SlotRegistryErrorCode =
  | "SLOT_NOT_FOUND"
  | "SLOT_ID_COLLISION"
  | "SLOT_IDENTITY_REQUIRED"
  | "SLOT_PLUGIN_ID_REQUIRED"
  | "SLOT_NAME_REQUIRED"
  | "SLOT_COMPONENT_REQUIRED"
  | "SLOT_CONDITION_REQUIRED"
  | "SLOT_ORDER_INVALID";

export type ListSlotContributionsOptions = {
  pluginId?: string;
  slot?: string;
};

export type SlotRegistry = {
  register<Props = unknown>(
    contribution: SlotContribution<Props>,
  ): SlotContribution<Props>;
  get(contributionId: string): SlotContribution;
  list(options?: ListSlotContributionsOptions): SlotContribution[];
  unregister(contributionId: string): SlotContribution;
};
