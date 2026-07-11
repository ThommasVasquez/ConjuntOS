import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Snap points for the sheet. Defaults to a single half-screen point. */
  snapPoints?: Array<string | number>;
}

/**
 * Bottom-sheet wrapper around @gorhom/bottom-sheet. Driven declaratively by
 * the `open` boolean: expands to the first snap point when open and closes
 * otherwise. Renders a tap-to-dismiss backdrop and calls `onClose` whenever
 * the sheet returns to the closed (-1) index.
 */
export function Sheet({ open, onClose, children, snapPoints }: SheetProps) {
  const ref = useRef<BottomSheet>(null);
  const points = useMemo(() => snapPoints ?? ['50%'], [snapPoints]);

  useEffect(() => {
    if (open) {
      ref.current?.expand();
    } else {
      ref.current?.close();
    }
  }, [open]);

  const handleChange = useCallback(
    (index: number) => {
      // index of -1 means the sheet has fully closed.
      if (index === -1 && open) {
        onClose();
      }
    },
    [onClose, open],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={points}
      // v5 defaults enableDynamicSizing to true, which injects a
      // content-measured snap point. Combined with flex:1 content (no intrinsic
      // height), that collapses/ignores the explicit snapPoints. We always pass
      // explicit snapPoints, so disable dynamic sizing for deterministic height.
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={handleChange}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={{ flex: 1 }}>{children}</BottomSheetView>
    </BottomSheet>
  );
}
