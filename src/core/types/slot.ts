import type { RegistryComponent } from "./view";

declare const defaultSlotContributionProps: unique symbol;

type DefaultSlotContributionProps = {
  readonly [defaultSlotContributionProps]: typeof defaultSlotContributionProps;
};

export type SlotCondition<Props = unknown> = (props: Props) => boolean;

type SlotContributionComponent<Props> =
  | RegistryComponent<Props>
  | ([Props] extends [DefaultSlotContributionProps] ? unknown : never);

type SlotContributionCondition<Props> =
  | ((props: Props) => boolean)
  | ([Props] extends [DefaultSlotContributionProps] ? unknown : never);

export type SlotContribution<Props = DefaultSlotContributionProps> = {
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
