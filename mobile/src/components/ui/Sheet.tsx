import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { useTheme } from '@/providers/ThemeProvider';
import { tokensFor } from '@/theme/tokens';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Snap points for the sheet. Defaults to a single half-screen point. */
  snapPoints?: Array<string | number>;
}

/**
 * Bottom-sheet wrapper around @gorhom/bottom-sheet. Driven declaratively by
 * the `open` boolean: presents at the first snap point when open and dismisses
 * otherwise. Renders a tap-to-dismiss backdrop and calls `onClose` whenever
 * the sheet returns to the closed (-1) index.
 *
 * MUST be BottomSheetModal, not BottomSheet: a plain BottomSheet lays out inside
 * whatever view renders it, so a sheet owned by a small component (the
 * ProfileHeader bell, an in-row action) was clipped to that component's box —
 * the notifications panel showed up as a sliver across the header instead of
 * over the screen. The Modal variant portals to BottomSheetModalProvider at the
 * root (app/_layout.tsx), so the sheet is always screen-sized wherever it lives.
 */
export function Sheet({ open, onClose, children, snapPoints }: SheetProps) {
  const ref = useRef<BottomSheetModal>(null);
  const points = useMemo(() => snapPoints ?? ['50%'], [snapPoints]);
  const { theme } = useTheme();
  const tokens = tokensFor(theme);

  useEffect(() => {
    if (open) {
      ref.current?.present();
    } else {
      ref.current?.dismiss();
    }
  }, [open]);

  // `onDismiss` is the ONLY close signal we act on. It fires exactly once, after
  // the modal has actually gone away (backdrop tap, pan down, or our own
  // dismiss()). Mirroring it with an onChange(-1) handler is worse than
  // redundant: BottomSheetModal reports index -1 during mount/animation too, so
  // the second signal could close a sheet the same tap had just opened. And if
  // NO signal reaches the parent, `open` stays true, the next trigger tap is a
  // true → true no-op, and the button looks dead — which is what happened to the
  // notifications bell.
  const syncClosed = useCallback(() => {
    if (open) onClose();
  }, [onClose, open]);

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
    <BottomSheetModal
      ref={ref}
      snapPoints={points}
      // v5 defaults enableDynamicSizing to true, which injects a
      // content-measured snap point. Combined with flex:1 content (no intrinsic
      // height), that collapses/ignores the explicit snapPoints. We always pass
      // explicit snapPoints, so disable dynamic sizing for deterministic height.
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={syncClosed}
      backdropComponent={renderBackdrop}
      // Theme the sheet surface per scheme: elevated surface (#0b1614 dark /
      // #ffffff light) with a subtle glass border, instead of the library's
      // default white card.
      backgroundStyle={{
        backgroundColor: tokens.primaryLight,
        borderWidth: 1,
        borderColor: tokens.border,
      }}
      // The grab handle must use textMuted, not border: border is 16%-alpha teal
      // and is effectively invisible against #0b1614.
      handleIndicatorStyle={{ backgroundColor: tokens.textMuted, width: 44 }}
    >
      <BottomSheetView style={{ flex: 1 }}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
}
