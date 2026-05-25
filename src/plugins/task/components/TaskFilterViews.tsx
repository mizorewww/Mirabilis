export type TaskPageListItem = {
  routeToken?: string;
  title: string;
};

export type TaskPageListViewProps = {
  pages: readonly TaskPageListItem[];
};

export type TaskFilterEmptyStateProps = {
  filterName: string;
};

export function TaskPageListView({ pages }: TaskPageListViewProps) {
  return (
    <ul aria-label="Task pages">
      {pages.map((page, index) => (
        <li key={getTaskPageListItemKey(page, index)}>{page.title}</li>
      ))}
    </ul>
  );
}

function getTaskPageListItemKey(
  page: TaskPageListItem,
  index: number,
): string {
  return page.routeToken?.trim() || `task-page-result-${index + 1}`;
}

export function TaskFilterEmptyState({
  filterName,
}: TaskFilterEmptyStateProps) {
  return <p role="status">{`${filterName} has no pages.`}</p>;
}
