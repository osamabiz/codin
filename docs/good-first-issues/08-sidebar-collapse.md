## Summary

The **History** section of the sidebar (`src/ui/SidebarProvider.ts`) currently expands on load
because its root `TreeItem` is created with `TreeItemCollapsibleState.Expanded`. Change it to
`TreeItemCollapsibleState.Collapsed` so the section starts collapsed and users open it on demand.

## Why it matters

The History section shows past completed tasks. On first load — and especially for new users — this
section is empty or shows old unrelated tasks. Having it expanded by default pushes the more
immediately useful **Plan** and **Context files** sections down and out of view. Collapsing it by
default makes the sidebar feel cleaner and keeps the active-task information visible without
scrolling.

## Relevant spec file

`docs/pages/sidebar-view.md` — describes all three collapsible sections (Current task, Plan,
Context files, History) and their intended purpose. The History section is explicitly the
lowest-priority section for a user in the middle of an active task.

## Acceptance criteria

- [ ] The History section's root `TreeItem` in `src/ui/SidebarProvider.ts` is initialized with `TreeItemCollapsibleState.Collapsed`
- [ ] The Plan and Context files sections are **not** changed (they should remain as-is)
- [ ] After the change, loading VS Code with the extension active shows the History section collapsed by default
- [ ] Clicking the History section header expands it normally (VS Code handles this automatically — verify it still works)
- [ ] Manual smoke test: reload the extension, confirm History is collapsed, expand it, confirm past tasks are still visible
- [ ] `npm test` passes with no new failures (no test changes should be needed for a one-line change)

## Estimated complexity

**S** — One-line change in one file. Ideal for a first-time contributor getting familiar with the
VS Code TreeView API.
