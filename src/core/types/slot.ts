import type { RegistryComponent } from "./view";

type IsExactlyUnknown<Props> = [unknown] extends [Props]
  ? [Props] extends [unknown]
    ? true
    : false
  : false;

export type SlotCondition<Props = unknown> =
  IsExactlyUnknown<Props> extends true ? unknown : (props: Props) => boolean;

type SlotContributionComponent<Props> = [Props] extends [never]
  ? RegistryComponent<unknown>
  : RegistryComponent<Props>;

type SlotContributionCondition<Props> = [Props] extends [never]
  ? SlotCondition<unknown>
  : (props: Props) => boolean;

export type SlotContribution<Props = never> = {
  id: string;
  pluginId: string;
  slot: string;
  order?: number;
  when?: SlotContributionCondition<Props>;
  component: SlotContributionComponent<Props>;
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
