import { useCallback, useRef, useState } from "react";

export type DiscardGuard = {
	setDirty: (dirty: boolean) => void;
	setSaving: (saving: boolean) => void;
	onOpenChange: (open: boolean) => void;
	close: () => void;
	confirm: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onConfirm: () => void;
	};
};

export function useDiscardGuard(
	onOpenChange: (open: boolean) => void,
): DiscardGuard {
	const dirty = useRef(false);
	const saving = useRef(false);
	const [asking, setAsking] = useState(false);
	const setDirty = useCallback((next: boolean) => {
		dirty.current = next;
	}, []);
	const setSaving = useCallback((next: boolean) => {
		saving.current = next;
	}, []);

	function close() {
		dirty.current = false;
		saving.current = false;
		setAsking(false);
		onOpenChange(false);
	}

	return {
		setDirty,
		setSaving,
		onOpenChange(open) {
			if (open) onOpenChange(true);
			else if (saving.current) return;
			else if (dirty.current) setAsking(true);
			else close();
		},
		close,
		confirm: { open: asking, onOpenChange: setAsking, onConfirm: close },
	};
}
