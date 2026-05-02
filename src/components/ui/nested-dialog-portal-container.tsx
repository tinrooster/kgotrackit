import * as React from "react";

/** Dialog content element to portal Popover/Select into; updated when the dialog panel mounts. */
export const NestedDialogPortalHostContext = React.createContext<HTMLElement | null>(null);
