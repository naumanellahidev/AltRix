import { useEffect } from "react";
import { useActiveChild } from "@/context/ActiveChildContext";
import { ChildInfo } from "@/hooks/useMyChildren";

/**
 * Bridges parent component's selectedChild state with the global ActiveChildContext.
 * Keeps the existing prop-drilling parent modules working AND exposes the same
 * active child via context for any deeply-nested component.
 */
interface Props {
  selectedChild: ChildInfo | null;
  onSelectChild: (child: ChildInfo | null) => void;
}

export function ActiveChildBridge({ selectedChild, onSelectChild }: Props) {
  const { activeChild, setActiveChild } = useActiveChild();

  // When context's active child changes (e.g. switcher inside a child route),
  // propagate it up to the parent state.
  useEffect(() => {
    if (
      activeChild &&
      activeChild.student_id !== selectedChild?.student_id
    ) {
      onSelectChild(activeChild);
    }
  }, [activeChild, selectedChild, onSelectChild]);

  // When parent state changes (e.g. shell switcher), reflect into context.
  useEffect(() => {
    if (
      selectedChild &&
      selectedChild.student_id !== activeChild?.student_id
    ) {
      setActiveChild(selectedChild);
    }
  }, [selectedChild, activeChild, setActiveChild]);

  return null;
}
